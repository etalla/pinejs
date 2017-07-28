import * as _db from '../database-layer/db'
import * as _express from 'express'

import * as _ from 'lodash'
import * as Promise from 'bluebird'
import TypedError = require('typed-error')

type LFModel = any[]

const LF2AbstractSQL: {
	LF2AbstractSQL: {
		createInstance: () => {
			match: (lfModel: LFModel, rule: 'Process') => AbstractSQLCompiler.AbstractSqlModel
			addTypes: (types: typeof sbvrTypes) => void
			reset: () => void
		}
	}
	LF2AbstractSQLPrep: {
		match: (lfModel: LFModel, rule: 'Process') => LFModel
		_extend({}): typeof LF2AbstractSQL.LF2AbstractSQLPrep
	}
	createTranslator: (types: typeof sbvrTypes) => (lfModel: LFModel, rule: 'Process') => AbstractSQLCompiler.AbstractSqlModel
}  = require('@resin/lf-to-abstract-sql')

type Callback<T> = (err: Error, result: T) => void
type AnyObject = {
	[index: string]: any
}
interface Indexable<T> {
	[index: string]: T
}

import * as AbstractSQLCompiler from '@resin/abstract-sql-compiler'
let abstractSQLCompiler: AbstractSQLCompiler.EngineInstance
import * as PinejsClientCore from 'pinejs-client/core'
const sbvrTypes = require('@resin/sbvr-types')
const {
	sqlNameToODataName,
	odataNameToSqlName,
}: {
	sqlNameToODataName: (sqlName: string) => string,
	odataNameToSqlName: (sqlName: string) => string,
} = require('@resin/odata-to-abstract-sql')

const SBVRParser: {
	matchAll: (seModel: string, rule: 'Process') => LFModel
} = require('../extended-sbvr-parser/extended-sbvr-parser')

const migrator = require('../migrator/migrator')
const ODataMetadataGenerator = require('../sbvr-compiler/ODataMetadataGenerator')

const devModel = require('./dev.sbvr')
const permissions = require('./permissions')
import * as uriParser from './uri-parser'

import * as controlFlow from './control-flow'
import * as memoize from 'memoizee'

declare module '@resin/abstract-sql-compiler' {
	interface AbstractSqlTable {
		fetchProcessingFields?: {
			[ field: string ]: typeof fetchProcessing['']
		}
		localFields?: {
			[ odataName: string ]: true
		}
	}
}


declare module 'express-serve-static-core' {
	interface Request {
		batch?: uriParser.UnparsedRequest[]
		custom?: {
			[ key: string ]: any
		}
		user?: {
			permissions: string[]
		}
		apiKey?: {
			permissions: string[]
		}
		tx?: _db.Tx
		hooks?: {}
	}
	interface Response {
		sendMulti: Function
	}
}

interface Response {
	status?: number
	headers?: {
		[ headerName: string ]: any
	}
	body?: {}
}

const memoizedCompileRule = memoize(
	(abstractSqlQuery: AbstractSQLCompiler.AbstractSqlQuery) => {
		return abstractSQLCompiler.compileRule(abstractSqlQuery)
	},
	{ primitive: true }
)


let db = undefined as any as _db.Database
let app: _express.Application

const fetchProcessing: { [type: string]: (field: any) => Promise<any> } = _.mapValues(sbvrTypes, ({ fetchProcessing }) => {
	if (fetchProcessing != null) {
		return Promise.promisify(fetchProcessing)
	}
})

const LF2AbstractSQLTranslator = LF2AbstractSQL.createTranslator(sbvrTypes)

const seModels: {
	[ vocabulary: string ]: string
} = {}
const abstractSqlModels: {
	[ vocabulary: string ]: AbstractSQLCompiler.AbstractSqlModel
} = {}
const sqlModels: {
	[ vocabulary: string ]: AbstractSQLCompiler.SqlModel
} = {}
const odataMetadata: {
	[ vocabulary: string ]: {}
} = {}

enum HookNames {
	'PREPARSE' = 'PREPARSE',
	'POSTPARSE' = 'POSTPARSE',
	'PRERUN' = 'PRERUN',
	'POSTRUN' = 'POSTRUN',
	'PRERESPOND' = 'PRERESPOND'
}
type Hooks = {
	[hookName in HookNames]?: Function[]
}
interface VocabHooks {
	[ resourceName: string ]: Hooks
}
interface MethodHooks {
	[ vocab: string ]: VocabHooks
}
const apiHooks = {
	all: {} as MethodHooks,
	GET: {} as MethodHooks,
	PUT: {} as MethodHooks,
	POST: {} as MethodHooks,
	PATCH: {} as MethodHooks,
	MERGE: {} as MethodHooks,
	DELETE: {} as MethodHooks,
	OPTIONS: {} as MethodHooks,
}

// Share hooks between merge and patch since they are the same operation, just MERGE was the OData intermediary until the HTTP spec added PATCH.
apiHooks.MERGE = apiHooks.PATCH

class UnsupportedMethodError extends TypedError {}
class SqlCompilationError extends TypedError {}
class SbvrValidationError extends TypedError {}
class InternalRequestError extends TypedError {}

const resolveSynonym = ({ vocabulary, resourceName }: { vocabulary: string, resourceName: string }) => {
	const sqlName = odataNameToSqlName(resourceName)
	return _(sqlName)
		.split('-')
		.map((resourceName) =>
			_.get(abstractSqlModels, [vocabulary, 'synonyms', resourceName], resourceName)
		)
		.join('-')
}

const resolveNavigationResource = (vocabulary: string, resourceName: string, navigationName: string) => {
	const navigation = _(odataNameToSqlName(navigationName))
		.split('-')
		.flatMap((resourceName) => {
			resolveSynonym({ vocabulary, resourceName }).split('-')
		})
		.concat('$')
		.value()
	const resolvedResourceName = resolveSynonym({ vocabulary, resourceName })
	const mapping = _.get(abstractSqlModels[vocabulary].relationships[resolvedResourceName], navigation) as undefined | AbstractSQLCompiler.RelationshipMapping
	if (mapping == null) {
		throw new Error(`Cannot navigate from '${resourceName}' to '${navigationName}'`)
	}
	return sqlNameToODataName(mapping[1][0])
}

// TODO: Clean this up and move it into the db module.
const prettifyConstraintError = (err: Error | TypedError, tableName: string) => {
	if (err instanceof db.ConstraintError) {
		let matches: RegExpExecArray | null = null
		if (err instanceof db.UniqueConstraintError) {
			switch (db.engine) {
				case 'mysql':
					matches = /ER_DUP_ENTRY: Duplicate entry '.*?[^\\]' for key '(.*?[^\\])'/.exec(err.message)
				break
				case 'postgres':
					matches = new RegExp('"' + tableName + '_(.*?)_key"').exec(err.message)
				break
			}
			// We know it's the right error type, so if no matches exist just throw a generic error message, since we have failed to get the info for a more specific one.
			if (matches == null) {
				throw new db.UniqueConstraintError('Unique key constraint violated')
			}
			throw new db.UniqueConstraintError('"' + sqlNameToODataName(matches[1]) + '" must be unique.')
		}

		if (err instanceof db.ForeignKeyConstraintError) {
			switch (db.engine) {
				case 'mysql':
					matches = /ER_ROW_IS_REFERENCED_: Cannot delete or update a parent row: a foreign key constraint fails \(".*?"\.(".*?").*/.exec(err.message)
				break
				case 'postgres':
					matches = new RegExp('"' + tableName + '" violates foreign key constraint ".*?" on table "(.*?)"').exec(err.message)
					if (matches == null) {
						matches = new RegExp('"' + tableName + '" violates foreign key constraint "' + tableName + '_(.*?)_fkey"').exec(err.message)
					}
				break
			}
			// We know it's the right error type, so if no matches exists just throw a generic error message, since we have failed to get the info for a more specific one.
			if (matches == null) {
				throw new db.ForeignKeyConstraintError('Foreign key constraint violated')
			}
			throw new db.ForeignKeyConstraintError('Data is referenced by ' + sqlNameToODataName(matches[1]) + '.')
		}

		throw err
	}
}

const resolveOdataBind = (odataBinds: uriParser.ODataRequest['odataBinds'], value) => {
	if (_.isObject(value) && value.bind != null) {
		[, value] = odataBinds[value.bind]
	}
	return value
}

const getAndCheckBindValues = (vocab: string, odataBinds: any[] = [], bindings: AbstractSQLCompiler.Binding[], values: AnyObject = {}) => {
	const sqlModelTables = sqlModels[vocab].tables
	return Promise.map(bindings, (binding) => {
		let fieldName: string
		let field: { dataType: string }
		let value: any
		if (binding[0] === 'Bind') {
			if (_.isArray(binding[1])) {
				let tableName
				[tableName, fieldName] = binding[1]

				const referencedName = tableName + '.' + fieldName
				value = values[referencedName]
				if (value === undefined) {
					value = values[fieldName]
				}

				value = resolveOdataBind(odataBinds, value)

				const sqlTableName = odataNameToSqlName(tableName)
				const sqlFieldName = odataNameToSqlName(fieldName)
				let maybeField = _.find(sqlModelTables[sqlTableName].fields, {
					fieldName: sqlFieldName
				})
				if (maybeField == null) {
					throw new Error(`Could not find field '${fieldName}'`)
				}
				field = maybeField
			} else if (_.isInteger(binding[1])) {
				if (binding[1] >= odataBinds.length) {
					console.error("Invalid binding number '#{binding[1]}' for binds: ", odataBinds)
					throw new Error('Invalid binding')
				}
				let dataType
				[dataType, value] = odataBinds[binding[1]]
				field = { dataType }
			} else {
				throw new Error("Unknown binding: #{binding}")
			}
		} else {
			let dataType
			[dataType, value] = binding
			field = { dataType }
		}

		if (value === undefined) {
			return db.DEFAULT_VALUE
		}

		return abstractSQLCompiler.dataTypeValidate(value, field)
		.catch((e: Error) => {
			e.message = '"' + fieldName + '" ' + e.message
			throw e
		})
	})
}

const checkModifiedFields = (referencedFields: AbstractSQLCompiler.ReferencedFields, modifiedFields: AbstractSQLCompiler.ModifiedFields) => {
	const refs = referencedFields[modifiedFields.table]
	// If there are no referenced fields of the modified table then the rule is not affected
	if (refs == null) {
		return false
	}
	// If there are no specific fields listed then that means they were all modified (ie insert/delete) and so the rule can be affected
	if (modifiedFields.fields == null) {
		return true
	}
	// Otherwise check if there are any matching fields to see if the rule is affected
	return _.intersection(refs, modifiedFields.fields).length > 0
}
const isRuleAffected = (rule: AbstractSQLCompiler.SqlRule, request?: uriParser.ODataRequest) => {
	// If there is no abstract sql query then nothing was modified
	if (request == null || request.abstractSqlQuery == null) {
		return false
	}
	// If for some reason there are no referenced fields known for the rule then we just assume it may have been modified
	if (rule.referencedFields == null) {
		return true
	}
	const modifiedFields = abstractSQLCompiler.getModifiedFields(request.abstractSqlQuery)
	// If we can't get any modified fields we assume the rule may have been modified
	if (modifiedFields == null) {
		console.warn("Could not determine the modified table/fields info for '#{request.method}' to #{request.vocabulary}", request.abstractSqlQuery)
		return true
	}
	if (_.isArray(modifiedFields)) {
		return _.some(modifiedFields, _.partial(checkModifiedFields, rule.referencedFields))
	}
	return checkModifiedFields(rule.referencedFields, modifiedFields)
}

const validateModel = (tx: _db.Tx, modelName: string, request?: uriParser.ODataRequest) => {
	return Promise.map(sqlModels[modelName].rules, (rule) => {
		if (!isRuleAffected(rule, request)) {
			// If none of the fields intersect we don't need to run the rule! :D
			return
		}

		return getAndCheckBindValues(modelName, undefined, rule.bindings, undefined)
		.then((values) => {
			return tx.executeSql(rule.sql, values)
		}).then((result) => {
			const v = result.rows.item(0).result
			if (v === false || v === 0 || v === '0') {
				throw new SbvrValidationError(rule.structuredEnglish)
			}
		})
	})
}

const executeModel = (tx: _db.Tx, model: sbvrUtils.Model, callback?: Callback<void>) => {
	return executeModels(tx, [model], callback)
}

interface CompiledModel {
	vocab: string;
	se: string;
	lf: LFModel;
	abstractsql: AbstractSQLCompiler.AbstractSqlModel;
	sql: AbstractSQLCompiler.SqlModel;
}
const executeModels = (tx: _db.Tx, models: sbvrUtils.Model[], callback?: Callback<void>) => {
	return Promise.map(models, (model) => {
		const seModel = model.modelText
		const vocab = model.apiRoot

		return (migrator.run(tx, model) as Promise<void>)
		.then(() => {
			try {
				var lfModel = SBVRParser.matchAll(seModel, 'Process')
			} catch (e) {
				console.error('Error parsing model', vocab, e, e.stack)
				throw new Error('Error parsing model: ' + e)
			}

			try {
				var abstractSqlModel = LF2AbstractSQLTranslator(lfModel, 'Process')
				var sqlModel = abstractSQLCompiler.compileSchema(abstractSqlModel)
				var metadata = ODataMetadataGenerator(vocab, sqlModel) as string
			} catch (e) {
				console.error('Error compiling model', vocab, e, e.stack)
				throw new Error('Error compiling model: ' + e)
			}

			// Create tables related to terms and fact types
			// Use `Promise.reduce` to run statements sequentially, as the order of the CREATE TABLE statements matters (eg. for foreign keys).
			return Promise.each(sqlModel.createSchema, (createStatement) => {
				const promise = tx.executeSql(createStatement)
				if (db.engine === 'websql') {
					promise.catch((err) => {
						console.warn("Ignoring errors in the create table statements for websql as it doesn't support CREATE IF NOT EXISTS", err)
					})
				}
				return promise
			}).then(() => {
				seModels[vocab] = seModel
				abstractSqlModels[vocab] = abstractSqlModel
				sqlModels[vocab] = sqlModel
				odataMetadata[vocab] = metadata

				uriParser.addClientModel(vocab, abstractSqlModel)

				// Validate the [empty] model according to the rules.
				// This may eventually lead to entering obligatory data.
				// For the moment it blocks such models from execution.
				return validateModel(tx, vocab)
			}).then((): CompiledModel => {
				// TODO: Can we do this without the cast?
				api[vocab] = new PinejsClient('/' + vocab + '/') as LoggingClient
				api[vocab].logger = _.cloneDeep(console)
				if (model.logging != null) {
					const defaultSetting = _.get(model.logging, 'default', true)
					for (const k in model.logging) {
						const key = k as keyof Console
						if (_.isFunction(api[vocab].logger[key]) && !_.get(model.logging[key], defaultSetting)) {
							api[vocab].logger[key] = _.noop
						}
					}
				}

				return {
					vocab,
					se: seModel,
					lf: lfModel,
					abstractsql: abstractSqlModel,
					sql: sqlModel,
				}
			})
		})
	// Only update the dev models once all models have finished executing.
	}).map((model: CompiledModel) => {
		const updateModel = (modelType: keyof CompiledModel) => {
			return api.dev.get({
				resource: 'model',
				passthrough: {
					tx,
					req: permissions.rootRead,
				},
				options: {
					$select: 'id',
					$filter: {
						is_of__vocabulary: model.vocab,
						model_type: modelType,
					}
				},
			}).then((result) => {
				let method: SupportedMethod = 'POST'
				let uri = '/dev/model'
				const body: AnyObject = {
					is_of__vocabulary: model.vocab,
					model_value: model[modelType],
					model_type: modelType,
				}
				const id = _.get(result, ['0', 'id'])
				if (id != null) {
					uri += '(' + id + ')'
					method = 'PATCH'
					body.id = id
				}

				return runURI(method, uri, body, tx, permissions.root)
			})
		}

		return Promise.map([
			'se',
			'lf',
			'abstractsql',
			'sql',
		], updateModel)
	}).tapCatch(() => {
		return Promise.map(models, ({ apiRoot }) => {
			return cleanupModel(apiRoot)
		})
	}).return().nodeify(callback)
}

const cleanupModel = (vocab: string) => {
	delete seModels[vocab]
	delete abstractSqlModels[vocab]
	delete sqlModels[vocab]
	delete odataMetadata[vocab]
	uriParser.deleteClientModel(vocab)
	delete api[vocab]
}

const mergeHooks = (a, b) => {
	return _.mergeWith({}, a, b, (a, b) => {
		if (_.isArray(a)) {
			return a.concat(b)
		}
	})
}
type SupportedMethod = keyof typeof apiHooks
interface HookRequest {
	method: SupportedMethod
	vocabulary: string
	resourceName?: string
}
const getResourceHooks = (vocabHooks: VocabHooks, resourceName?: string) => {
	if (vocabHooks == null) {
		return {}
	}
	// When getting the hooks list for the sake of PREPARSE hooks
	// we don't know the resourceName we'll be acting on yet
	if (resourceName == null) {
		return vocabHooks['all']
	}
	mergeHooks(
		vocabHooks[resourceName],
		vocabHooks['all'],
	)
}
const getVocabHooks = (methodHooks: MethodHooks, request: HookRequest) => {
	let resourceName = request.resourceName
	if (methodHooks == null) {
		return {}
	}
	if (resourceName != null) {
		resourceName = resolveSynonym({
			vocabulary: request.vocabulary,
			resourceName,
		})
	}
	return mergeHooks(
		getResourceHooks(methodHooks[request.vocabulary], resourceName),
		getResourceHooks(methodHooks['all'], resourceName),
	)
}
const getHooks = (request: HookRequest) => {
	return mergeHooks(
		getVocabHooks(apiHooks[request.method], request),
		getVocabHooks(apiHooks['all'], request),
	)
}

const runHook = (hookName: string, args: { request?: uriParser.ODataRequest, req: _express.Request, res?: _express.Response, tx?: _db.Tx, result?, data?: { d: number | any[] } }) => {
	Object.defineProperty(args, 'api', {
		get: _.once(() => {
			return api[args.request.vocabulary].clone({ passthrough: _.pick(args, 'req', 'tx') })
		})
	})
	const hooks = args.req.hooks[hookName] || []
	return Promise.map(hooks, (hook) => {
		return hook(args)
	})
}

const deleteModel = (vocabulary: string, callback?: Callback<void>) => {
	return db.transaction().then((tx) => {
		const dropStatements: Array<Promise<any>> =
			_.map(_.get(sqlModels, [ vocabulary, 'dropSchema' ]), (dropStatement: string) => {
				return tx.executeSql(dropStatement)
			})
		return Promise.all(dropStatements.concat([
			api.dev.delete({
				resource: 'model',
				passthrough: {
					tx,
					req: permissions.root,
				},
				options: {
					$filter: {
						is_of__vocabulary: vocabulary,
					},
				},
			})
		])).then(() => {
			tx.end()
			return cleanupModel(vocabulary)
		}).catch((err) => {
			tx.rollback()
			throw err
		})
	}).nodeify(callback)
}

const getID = (vocab: string, request: uriParser.ODataRequest) => {
	const idField = sqlModels[vocab].tables[request.resourceName].idField
	for (const whereClause of request.abstractSqlQuery) {
		if (whereClause[0] === 'Where') {
			for (const comparison of whereClause.slice(1)) {
				if (comparison[0] === 'Equals') {
					if (comparison[1][2] === idField) {
						return comparison[2][1]
					}
					if (comparison[2][2] === idField) {
						return comparison[1][1]
					}
				}
			}
		}
	}
	return 0
}

const rowsObjectHack = (i: number) => this[i]
const checkForExpansion = Promise.method((vocab: string, abstractSqlModel: AbstractSQLCompiler.AbstractSqlModel, parentResourceName: string, fieldName: string, instance) => {
	let field
	try {
		field = JSON.parse(instance[fieldName])
	} catch (e) {
		// If we can't JSON.parse the field then we use it directly.
		field = instance[fieldName]
	}

	if (_.isArray(field)) {
		// Hack to look like a rows object
		field.item = rowsObjectHack
		const mappingResourceName = resolveNavigationResource(vocab, parentResourceName, fieldName)
		return processOData(vocab, abstractSqlModel, mappingResourceName, field).then((expandedField) => {
			instance[fieldName] = expandedField
		})
	} else if (field != null) {
		const mappingResourceName = resolveNavigationResource(vocab, parentResourceName, fieldName)
		instance[fieldName] = {
			__deferred: {
				uri: '/' + vocab + '/' + mappingResourceName + '(' + field + ')',
			},
			__id: field,
		}
	}
})

const odataResourceURI = (vocab: string, resourceName: string, id: string | number) => {
	if (_.isString(id)) {
		id = "'" + encodeURIComponent(id) + "'"
	}
	return '/' + vocab + '/' + resourceName + '(' + id + ')'
}

const getLocalFields = (table: AbstractSQLCompiler.AbstractSqlTable) => {
	if (table.localFields == null) {
		table.localFields = {}
		for (const { fieldName, dataType } of table.fields) {
			if (dataType !== 'ForeignKey') {
				const odataName = sqlNameToODataName(fieldName)
				table.localFields[odataName] = true
			}
		}
	}
	return table.localFields
}
const getFetchProcessingFields = (table: AbstractSQLCompiler.AbstractSqlTable) => {
	if (table.fetchProcessingFields == null) {
		table.fetchProcessingFields = _(table.fields)
			.filter(({ dataType }) => fetchProcessing[dataType] != null)
			.map(({ fieldName, dataType }) => {
				const odataName = sqlNameToODataName(fieldName)
				return [
					odataName,
					fetchProcessing[dataType],
				]
			})
			.fromPairs()
			.value()
	}
	return table.fetchProcessingFields!
}
const processOData = (vocab: string, abstractSqlModel: AbstractSQLCompiler.AbstractSqlModel, resourceName: string, rows: _db.Result['rows']): Promise<number | _db.Row[]> => {
	if (rows.length === 0) {
		return Promise.resolve([])
	}

	if (rows.length === 1) {
		if (rows.item(0).$count != null) {
			const count = parseInt(rows.item(0).$count, 10)
			return Promise.resolve(count)
		}
	}

	const sqlResourceName = resolveSynonym({ vocabulary: vocab, resourceName })
	const table = abstractSqlModel.tables[sqlResourceName]

	const odataIdField = sqlNameToODataName(table.idField)
	const instances = rows.map((instance) => {
		instance.__metadata = {
			// TODO: This should support non-number id fields
			uri: odataResourceURI(vocab, resourceName, +instance[odataIdField]),
			type: '',
		}
		return instance
	})

	let instancesPromise = Promise.resolve()

	const localFields = getLocalFields(table)
	// We check that it's not a local field, rather than that it is a foreign key because of the case where the foreign key is on the other resource
	// and hence not known to this resource
	const expandableFields = _.filter(_.keys(instances[0]), (fieldName) => !_.startsWith(fieldName, '__') && !localFields.hasOwnProperty(fieldName))
	if (expandableFields.length > 0) {
		instancesPromise = Promise.map(instances, (instance) => {
			return Promise.map(expandableFields, (fieldName) => {
				return checkForExpansion(vocab, abstractSqlModel, sqlResourceName, fieldName, instance)
			})
		}).return()
	}

	const fetchProcessingFields = getFetchProcessingFields(table)
	const processedFields = _.filter(_.keys(instances[0]), (fieldName) => !_.startsWith(fieldName, '__') && fetchProcessingFields.hasOwnProperty(fieldName))
	if (processedFields.length > 0) {
		instancesPromise = instancesPromise.then(() => {
			return Promise.map(instances, (instance) => {
				return Promise.map(processedFields, (resourceName) => {
					return fetchProcessingFields[resourceName](instance[resourceName]).then((result) => {
						instance[resourceName] = result
					})
				})
			})
		}).return()
	}

	return instancesPromise.return(instances)
}

const LF2AbstractSQLPrepHack = LF2AbstractSQL.LF2AbstractSQLPrep._extend({ CardinalityOptimisation: () => this._pred(false) })
const translator = LF2AbstractSQL.LF2AbstractSQL.createInstance()
translator.addTypes(sbvrTypes)
const runRule = (vocab: string, rule: string, callback?) => {
	return Promise.try(() => {
		const seModel = seModels[vocab]
		const { logger } = api[vocab]
		let lfModel: LFModel
		let slfModel: LFModel
		let abstractSqlModel: AbstractSQLCompiler.AbstractSqlModel

		try {
			lfModel = SBVRParser.matchAll(seModel + '\nRule: ' + rule, 'Process')
		} catch (e) {
			logger.error('Error parsing rule', rule, e, e.stack)
			throw new Error(`Error parsing rule'${rule}': ${e}`)
		}

		const ruleLF = lfModel.pop()

		try {
			slfModel = LF2AbstractSQL.LF2AbstractSQLPrep.match(lfModel, 'Process')
			slfModel.push(ruleLF)
			slfModel = LF2AbstractSQLPrepHack.match(slfModel, 'Process')

			translator.reset()
			abstractSqlModel = translator.match(slfModel, 'Process')
		} catch (e) {
			logger.error('Error compiling rule', rule, e, e.stack)
			throw new Error(`Error compiling rule '${rule}': ${e}`)
		}

		const formulationType = ruleLF[1][0]
		let resourceName: string
		if (ruleLF[1][1][0] === 'LogicalNegation') {
			resourceName = ruleLF[1][1][1][1][2][1]
		} else {
			resourceName = ruleLF[1][1][1][2][1]
		}

		let fetchingViolators = false
		const ruleAbs = _.last(abstractSqlModel.rules)
		if (ruleAbs == null) {
			throw new Error('Unable to generate rule')
		}
		let ruleBody = _.find(ruleAbs, { 0: 'Body' })
		if (ruleBody[1][0] === 'Not' && ruleBody[1][1][0] === 'Exists' && ruleBody[1][1][1][0] === 'SelectQuery') {
			// Remove the not exists
			ruleBody[1] = ruleBody[1][1][1]
			fetchingViolators = true
		} else if (ruleBody[1][0] === 'Exists' && ruleBody[1][1][0] === 'SelectQuery') {
			// Remove the exists
			ruleBody[1] = ruleBody[1][1]
		} else {
			throw new Error('Unsupported rule formulation')
		}

		const wantNonViolators = formulationType in ['PossibilityFormulation', 'PermissibilityFormulation']
		if (wantNonViolators === fetchingViolators) {
			// What we want is the opposite of what we're getting, so add a not to the where clauses
			ruleBody[1] = _.map(ruleBody[1], (queryPart) => {
				if (queryPart[0] !== 'Where') {
					return queryPart
				}
				if (queryPart.length > 2) {
					throw new Error('Unsupported rule formulation')
				}
				return ['Where', ['Not', queryPart[1]]]
			})
		}

		// Select all
		ruleBody[1] = _.map(ruleBody[1], (queryPart) => {
			if (queryPart[0] !== 'Select') {
				return queryPart
			}
			return ['Select', '*']
		})
		const compiledRule = abstractSQLCompiler.compileRule(ruleBody)
		return getAndCheckBindValues(vocab, undefined, compiledRule.bindings, undefined)
		.then((values) => {
			return db.executeSql(compiledRule.query, values)
		})
		.then((result) => {
			const table = abstractSqlModels[vocab].tables[resourceName]
			const odataIdField = sqlNameToODataName(table.idField)
			let ids = result.rows.map((row) => row[table.idField])
			ids = _.uniq(ids)
			ids = _.map(ids, (id) => odataIdField + ' eq ' + id)
			let filter: string
			if (ids.length > 0) {
				filter = ids.join(' or ')
			} else {
				filter = '0 eq 1'
			}
			return runURI('GET', '/' + vocab + '/' + sqlNameToODataName(table.resourceName) + '?$filter=' + filter, undefined, undefined, permissions.rootRead)
			.then((result) => {
				result.__formulationType = formulationType
				result.__resourceName = resourceName
				return result
			})
		})
	}).nodeify(callback)
}

class PinejsClient extends PinejsClientCore(_ as any as PinejsClientCore.Util, Promise)<PinejsClient, Promise<{}>, Promise<number | AnyObject | AnyObject[]>> {
	_request({ method, url, body, tx, req, custom }) {
		return runURI(method, url, body, tx, req, custom)
	}
}

type LoggingClient = PinejsClient & {
	logger: Console
}
const api: {
	[vocab: string]: LoggingClient
} = {}

const unimplementedFunction = (): any => {
	throw new Error('Function is not implemented')
}
// We default to no permissions if no req object is passed in
const runURI = (
	method: SupportedMethod,
	url: string,
	body: AnyObject = {},
	tx?: _db.Tx,
	reqPermissions?: {
		user?: {
			permissions: string[]
		}
		apiKey?: {
			permissions: string[]
		}
	},
	custom?: {},
	callback?: () => void,
) => {
	if (callback != null && !_.isFunction(callback)) {
		const message = 'Called runURI with a non-function callback?!'
		console.trace(message)
		return Promise.reject(message)
	}

	let user, apiKey
	if (reqPermissions != null && _.isObject(reqPermissions)) {
		user = reqPermissions.user
		apiKey = reqPermissions.apiKey
	} else {
		if (reqPermissions != null) {
			console.warn('Non-object req passed to runURI?', reqPermissions, new Error().stack)
		}
		user = {
			permissions: []
		}
	}

	const req: _express.Request = {
		accepted: [] as _express.Request['accepted'],
		accepts: unimplementedFunction as _express.Request['accepts'],
		acceptsCharsets: unimplementedFunction as _express.Request['acceptsCharsets'],
		acceptsEncodings: unimplementedFunction as _express.Request['acceptsEncodings'],
		acceptsLanguages: unimplementedFunction as _express.Request['acceptsLanguages'],
		get: unimplementedFunction as _express.Request['get'],
		header: unimplementedFunction as _express.Request['header'],
		is: unimplementedFunction as _express.Request['is'],
		param: unimplementedFunction as _express.Request['param'],
		range: unimplementedFunction as _express.Request['range'],



		custom,
		user,
		apiKey,
		method,
		url,
		body,
		params: {},
		query: {},
		tx,
	}

	return new Promise((resolve, reject) => {
		const res: _express.Response = {
			app,
			attachment: unimplementedFunction as _express.Response['attachment'],
			addListener: unimplementedFunction as _express.Response['addListener'],
			addTrailers: unimplementedFunction as _express.Response['addTrailers'],
			charset: 'utf8',
			clearCookie: unimplementedFunction as _express.Response['clearCookie'],
			cookie: unimplementedFunction as _express.Response['cookie'],
			contentType: unimplementedFunction as _express.Response['contentType'],
			download: unimplementedFunction as _express.Response['download'],
			end: unimplementedFunction as _express.Response['end'],
			emit: unimplementedFunction as _express.Response['emit'],
			eventNames: unimplementedFunction as _express.Response['eventNames'],
			finished: false,
			format: unimplementedFunction as _express.Response['format'],
			get: unimplementedFunction as _express.Response['get'],
			getHeader: unimplementedFunction as _express.Response['getHeader'],
			getMaxListeners: unimplementedFunction as _express.Response['getMaxListeners'],
			jsonp: unimplementedFunction as _express.Response['jsonp'],
			links: unimplementedFunction as _express.Response['links'],
			listenerCount: unimplementedFunction as _express.Response['listenerCount'],
			listeners: unimplementedFunction as _express.Response['listeners'],
			locals: unimplementedFunction as _express.Response['locals'],
			location: unimplementedFunction as _express.Response['location'],
			on: unimplementedFunction as _express.Response['on'],
			once: unimplementedFunction as _express.Response['once'],
			pipe: unimplementedFunction as <T>() => T,
			prependListener: unimplementedFunction as _express.Response['prependListener'],
			prependOnceListener: unimplementedFunction as _express.Response['prependOnceListener'],
			redirect: unimplementedFunction as _express.Response['redirect'],
			render: unimplementedFunction as _express.Response['render'],
			removeAllListeners: unimplementedFunction as _express.Response['removeAllListeners'],
			removeHeader: unimplementedFunction as _express.Response['removeHeader'],
			removeListener: unimplementedFunction as _express.Response['removeListener'],
			sendfile: unimplementedFunction as _express.Response['sendfile'],
			sendFile: unimplementedFunction as _express.Response['sendFile'],
			sendDate: false,
			setDefaultEncoding: unimplementedFunction as _express.Response['setDefaultEncoding'],
			setHeader: unimplementedFunction as _express.Response['setHeader'],
			setMaxListeners: unimplementedFunction as _express.Response['setMaxListeners'],
			setTimeout: unimplementedFunction as _express.Response['setTimeout'],
			statusMessage: '',
			_write: unimplementedFunction as _express.Response['_write'],
			write: unimplementedFunction as _express.Response['write'],
			writable: false,
			writeContinue: unimplementedFunction as _express.Response['writeContinue'],
			writeHead: unimplementedFunction as _express.Response['writeHead'],
			vary: unimplementedFunction as _express.Response['vary'],

			headersSent: false,
			statusCode: 200,
			status: (statusCode: number) => {
				res.statusCode = statusCode
				return res
			},
			sendStatus: (statusCode: number) => {
				if (statusCode >= 400) {
					reject(statusCode)
				} else {
					resolve()
				}
				return res
			},
			send: (statusCode: number = res.statusCode) => {
				res.sendStatus(statusCode)
				return res
			},
			json: (data: any, statusCode: number = res.statusCode) => {
				if (statusCode >= 400) {
					reject(data)
				} else {
					resolve(data)
				}
				return res
			},
			set: () => res,
			type: () => res,
			header: () => res,
		}

		const next: _express.NextFunction = (route) => {
			console.warn('Next called on a runURI?!', method, url, route)
			res.sendStatus(500)
		}

		handleODataRequest(req, res, next)
	}).nodeify(callback)
}
const constructErrors = (result: Response | Response[] | Error) => {
	if (_.isError(result)) {
		return constructError(result)
	} else {
		return result
	}
}
const handleODataRequest: _express.Handler = (req, res, next) => {
	const url = req.url.split('/')
	const apiRoot = url[1]
	if (apiRoot == null || abstractSqlModels[apiRoot] == null) {
		return next('route')
	}

	if (process.env.DEBUG) {
		api[apiRoot].logger.log('Parsing', req.method, req.url)
	}

	const mapSeries = controlFlow.getMappingFn(req.headers)
	// Get the hooks for the current method/vocabulary as we know it,
	// in order to run PREPARSE hooks, before parsing gets us more info
	req.hooks = getHooks({
		method: req.method as SupportedMethod,
		vocabulary: apiRoot,
	})
	return runHook('PREPARSE', { req, tx: req.tx })
	.then(() => {
		const { method, url, body } = req

		let requests: uriParser.UnparsedRequest[]
		// Check if it is a single request or a batch
		if (req.batch != null && req.batch.length > 0) {
			requests = req.batch
		} else {
			requests = [{ method: method, url: url, data: body }]
		}
		// Parse the OData requests
		return mapSeries(requests, (requestPart) => {
			return uriParser.parseOData(requestPart).then(controlFlow.liftP((request) => {
				// Get the full hooks list now that we can
				req.hooks = getHooks(request)
				// Add/check the relevant permissions
				return runHook('POSTPARSE', { req, request, tx: req.tx })
				.return(request)
				.then(uriParser.translateUri)
				.then((request) => {
					// We defer compilation of abstract sql queries with references to other requests
					if (request.abstractSqlQuery != null && !request._defer) {
						try {
							request.sqlQuery = memoizedCompileRule(request.abstractSqlQuery)
						} catch (err) {
							api[apiRoot].logger.error('Failed to compile abstract sql: ', request.abstractSqlQuery, err, err.stack)
							throw new SqlCompilationError(err)
						}
					}
					return request
				})
			})).then((request) => {
				// Run the request in its own transaction
				return runTransaction<Response | Response[]>(req, (tx) => {
					if (_.isArray(request)) {
						const env = new Map()
						return Promise.reduce(request, runChangeSet(req, res, tx), env)
							.then((env) => Array.from(env.values()))
					} else {
						return runRequest(req, res, tx, request)
					}
				})
			})
		})
	})
	.map<Response | Response[], Response | Response[]>(constructErrors)
	.then((responses) => {
		res.set('Cache-Control', 'no-cache')
		// If we are dealing with a single request unpack the response and respond normally
		if (req.batch != null && req.batch.length === 0) {

			const [{ body, headers, status }] = responses as Response[]
			if (status) {
				res.status(status)
			}
			_.forEach(headers, (headerValue, headerName) => {
				res.set(headerName, headerValue)
			})

			if (!body) {
				res.send()
			} else {
				if (status != null) {
					res.status(status)
				}
				res.json(body)
			}
		// Otherwise its a multipart request and we reply with the appropriate multipart response
		} else {
			res.status(200).sendMulti(responses)
		}
	// If an error bubbles here it must have happened in the last then block
	// We just respond with 500 as there is probably not much we can do to recover
	}).catch((e: Error) => {
		console.error('An error occurred while constructing the response', e, e.stack)
		res.sendStatus(500)
	})
}

// Reject the error to use the nice catch syntax
const constructError = (e: any): Promise<Response> => {
	return Promise.reject(e)
	.catch(SbvrValidationError, (err) => {
		return { status: 400, body: err.message }
	}).catch(uriParser.BadRequestError, () => {
		return { status: 400 }
	}).catch(permissions.PermissionError, () => {
		return { status: 401 }
	}).catch(SqlCompilationError, uriParser.TranslationError, uriParser.ParsingError, permissions.PermissionParsingError, InternalRequestError, () => {
		return { status: 500 }
	}).catch(UnsupportedMethodError, () => {
		return { status: 405 }
	}).catch(e, (err) => {
		console.error(err)
		// If the err is an error object then use its message instead - it should be more readable!
		if (_.isError(err)) {
			err = err.message
		}
		return { status: 404, body: err }
	})
}

const runRequest = (req: _express.Request, res: _express.Response, tx: _db.Tx, request: uriParser.ODataRequest) => {
	const { logger } = api[request.vocabulary]
	const jsErrorHandler = (err: EvalError | RangeError | ReferenceError | SyntaxError | TypeError | URIError) => {
		logger.error(err, err.stack)
		throw new InternalRequestError()
	}

	if (process.env.DEBUG) {
		logger.log('Running', req.method, req.url)
	}
	// Forward each request to the correct method handler
	return runHook('PRERUN', { req, request, tx })
	.then(() => {
		switch (request.method) {
			case 'GET':
				return runGet(req, res, request, tx)
			case 'POST':
				return runPost(req, res, request, tx)
			case 'PUT':
			case 'PATCH':
			case 'MERGE':
				return runPut(req, res, request, tx)
			case 'DELETE':
				return runDelete(req, res, request, tx)
		}
	}).catch(db.DatabaseError, (err) => {
		prettifyConstraintError(err, request.resourceName)
		logger.error(err, err.stack)
		throw err
	})
	// TODO: Move this back to one `.catch` when the bluebird typings allow it
	.catch(EvalError, RangeError, ReferenceError, SyntaxError, TypeError, jsErrorHandler).catch(URIError, jsErrorHandler)
	.tap((result) => {
		return runHook('POSTRUN', { req, request, result, tx })
	}).then((result) => {
		return prepareResponse(req, res, request, result, tx)
	})
}

const runChangeSet = (req: _express.Request, res: _express.Response, tx: _db.Tx) => {
	return (env: Map<uriParser.ODataRequest['id'], Response>, request: uriParser.ODataRequest) => {
		request = updateBinds(env, request)
		return runRequest(req, res, tx, request).then((result) => {
			_.set(result, [ 'headers', 'Content-Id' ], request.id)
			env.set(request.id, result)
			return env
		})
	}
}

// Requests inside a changeset may refer to resources created inside the
// changeset, the generation of the sql query for those requests must be
// deferred untill the request they reference is run and returns an insert ID.
// This function compiles the sql query of a request which has been deferred
const updateBinds = (env: Map<uriParser.ODataRequest['id'], any>, request: uriParser.ODataRequest) => {
	if (request._defer) {
		request.odataBinds = _.map(request.odataBinds, ([tag, id]) => {
			if (tag === 'ContentReference') {
				id = _.get(env.get(id), 'body.id')
				if (_.isUndefined(id)) {
					throw new uriParser.BadRequestError('Reference to a non existing resource in Changeset')
				} else {
					return uriParser.parseId(id)
				}
			} else {
				return [tag, id]
			}
		})
		request.sqlQuery = memoizedCompileRule(request.abstractSqlQuery)
	}
	return request
}

const prepareResponse = (req: _express.Request, res: _express.Response, request: uriParser.ODataRequest, result, tx: _db.Tx): Promise<Response> => {
	switch (request.method) {
		case 'GET':
			return respondGet(req, res, request, result, tx)
		case 'POST':
			return respondPost(req, res, request, result, tx)
		case 'PUT':
		case 'PATCH':
		case 'MERGE':
			return respondPut(req, res, request, result, tx)
		case 'DELETE':
			return respondDelete(req, res, request, result, tx)
		case 'OPTIONS':
			return respondOptions(req, res, request, result, tx)
		default:
			return Promise.reject(new UnsupportedMethodError())
	}
}

// This is a helper method to handle using a passed in req.tx when available, or otherwise creating a new tx and cleaning up after we're done.
const runTransaction = <T>(req: _express.Request, callback: (tx: _db.Tx) => Promise<T>) => {
	if (req.tx != null) {
		// If an existing tx was passed in then use it.
		return callback(req.tx)
	} else {
		// Otherwise create a new transaction and handle tidying it up.
		return db.transaction().then((tx) => {
			return callback(tx)
			.tap(() => {
				tx.end()
			}).tapCatch(() => {
				tx.rollback()
			})
		})
	}
}

// This is a helper function that will check and add the bind values to the SQL query and then run it.
const runQuery = (tx: _db.Tx, request: uriParser.ODataRequest, queryIndex?: number, addReturning?: string) => {
	const { values, odataBinds, vocabulary } = request
	let { sqlQuery } = request
	if (sqlQuery == null) {
		return Promise.reject('No SQL query available to run')
	}
	if (_.isArray(sqlQuery)) {
		if (queryIndex == null) {
			return Promise.reject('Received a query index to run but the query is not an array')
		}
		sqlQuery = sqlQuery[queryIndex]
	}
	// We assign to a const here so that typescript remembers the type restrictions applied by the checks above
	const castSqlQuery = sqlQuery
	return getAndCheckBindValues(vocabulary, odataBinds, castSqlQuery.bindings, values)
	.then((values) => {
		if (process.env.DEBUG) {
			api[vocabulary].logger.log(castSqlQuery.query, values)
		}

		castSqlQuery.values = values
		return tx.executeSql(castSqlQuery.query, values, undefined, addReturning)
	})
}

const runGet = (_req: _express.Request, _res: _express.Response, request: uriParser.ODataRequest, tx: _db.Tx) => {
	if (request.sqlQuery != null) {
		return runQuery(tx, request)
	}
}

const respondGet = (req: _express.Request, res: _express.Response, request: uriParser.ODataRequest, result, tx: _db.Tx) => {
	const vocab = request.vocabulary
	if (request.sqlQuery != null) {
		return processOData(vocab, abstractSqlModels[vocab], request.resourceName, result.rows)
		.then((d) => {
			return runHook('PRERESPOND', { req, res, request, result, data: { d }, tx: tx }).then(() => {
				return { body: { d }, headers: { contentType: 'application/json' } }
			})
		})
	} else {
		if (request.resourceName === '$metadata') {
			return Promise.resolve({ body: odataMetadata[vocab], headers: { contentType: 'xml' } })
		} else {
			// TODO: request.resourceName can be '$serviceroot' or a resource and we should return an odata xml document based on that
			return Promise.resolve({
				status: 404
			})
		}
	}
}

const runPost = (_req: _express.Request, _res: _express.Response, request: uriParser.ODataRequest, tx: _db.Tx) => {
	const vocab = request.vocabulary

	const idField = abstractSqlModels[vocab].tables[resolveSynonym(request)].idField

	return runQuery(tx, request, undefined, idField).then((sqlResult) => {
		return validateModel(tx, vocab, request).then(() => {
			// Return the inserted/updated id.
			if (request.abstractSqlQuery![0] === 'UpdateQuery') {
				return request.sqlQuery.values[0]
			} else {
				return sqlResult.insertId
			}
		})
	})
}

const respondPost = (req: _express.Request, res: _express.Response, request: uriParser.ODataRequest, id, tx: _db.Tx) => {
	const vocab = request.vocabulary
	const location = odataResourceURI(vocab, request.resourceName, id)
	api[vocab].logger.log('Insert ID: ', request.resourceName, id)
	return runURI('GET', location, undefined, tx, req)
	.catch(() => {
		// If we failed to fetch the created resource then just return the id.
		return { d: [{ id }] }
	}).then((result) => {
		return runHook('PRERESPOND', { req, res, request, result, tx })
		.return({
			status: 201,
			body: result.d[0],
			headers: {
				contentType: 'application/json',
				Location: location,
			}
		})
	})
}


const runPut = (_req: _express.Request, _res: _express.Response, request: uriParser.ODataRequest, tx: _db.Tx) => {
	const vocab = request.vocabulary

	return Promise.try(() => {
		// If request.sqlQuery is an array it means it's an UPSERT, ie two queries: [InsertQuery, UpdateQuery]
		if (_.isArray(request.sqlQuery)) {
			// Run the update query first
			return runQuery(tx, request, 1)
			.then<_db.Result | void>((result) => {
				if (result.rowsAffected === 0) {
					// Then run the insert query if nothing was updated
					return runQuery(tx, request, 0)
				}
			})
		} else {
			return runQuery(tx, request)
		}
	}).then(() => {
		return validateModel(tx, vocab, request)
	})
}

const respondPut = (req: _express.Request, res: _express.Response, request: uriParser.ODataRequest, _result, tx: _db.Tx) => {
	return runHook('PRERESPOND', { req, res, request, tx: tx }).return({
		status: 200,
		headers: {},
	})
}
const respondDelete = respondPut
const respondOptions = respondPut

const runDelete = (_req: _express.Request, _res: _express.Response, request: uriParser.ODataRequest, tx: _db.Tx) => {
	const vocab = request.vocabulary

	return runQuery(tx, request).then(() => {
		return validateModel(tx, vocab, request)
	})
}

const executeStandardModels = (tx: _db.Tx, callback?: Callback<void>) => {
	// dev model must run first
	return executeModel(tx, {
		apiRoot: 'dev',
		modelText: devModel,
		logging: {
			log: false,
		},
	}).then(() => {
		return executeModels(tx, permissions.config.models)
	}).then(() => {
		console.info('Successfully executed standard models.')
	}).catch((err: Error) => {
		console.error('Failed to execute standard models.', err, err.stack)
		throw err
	}).nodeify(callback)
}

const addHook = (method: SupportedMethod, apiRoot: string, resourceName: string, callbacks: Hooks) => {
	const methodHooks = apiHooks[method]
	if (methodHooks == null) {
		throw new Error('Unsupported method: ' + method)
	}
	if (apiRoot !== 'all' && abstractSqlModels[apiRoot] == null) {
		throw new Error('Unknown api root: ' + apiRoot)
	}
	if (resourceName !== 'all') {
		const origResourceName = resourceName
		resourceName = resolveSynonym({ vocabulary: apiRoot, resourceName })
		if (abstractSqlModels[apiRoot].tables[resourceName] == null) {
			throw new Error('Unknown resource for api root: ' + origResourceName + ', ' + apiRoot)
		}
	}


	for (const callbackType in callbacks) {
		if (!(callbackType in HookNames)) {
			throw new Error('Unknown callback type: ' + callbackType)
		}
	}

	if (methodHooks[apiRoot] == null) {
		methodHooks[apiRoot] = {}
	}
	const apiRootHooks = methodHooks[apiRoot]
	if (apiRootHooks[resourceName] == null) {
		apiRootHooks[resourceName] = {}
	}
	// Cast as indexable so we can access via an index
	const resourceHooks = apiRootHooks[resourceName] as Indexable<Hooks['PREPARSE']>

	for (const callbackType in callbacks) {
		// Cast as indexable so we can access via an index
		const callback = (callbacks as Indexable<Function>)[callbackType]
		if (resourceHooks[callbackType] == null) {
			resourceHooks[callbackType] = []
		}
		resourceHooks[callbackType]!.push(callback)
	}
}

const setup = (_app: _express.Application, _db: _db.Database, callback?: Callback<void>) => {
	sbvrUtils.db = db = _db
	app = _app
	abstractSQLCompiler = AbstractSQLCompiler[db.engine]
	return db.transaction().then((tx) => {
		return executeStandardModels(tx).then(() => {
			permissions.setup(app, exports)
			_.extend(exports, permissions)
			tx.end()
		}).catch((err) => {
			tx.rollback()
			console.error('Could not execute standard models', err, err.stack)
			process.exit(1)
		})
	}).then(() => {
		return db.executeSql('CREATE UNIQUE INDEX "uniq_model_model_type_vocab" ON "model" ("is of-vocabulary", "model type");')
			.catchReturn(undefined) // we can't use IF NOT EXISTS on all dbs, so we have to ignore the error raised if this index already exists
	}).return().nodeify(callback)
}
const sbvrUtils = {
	db,
	sbvrTypes,
	resolveNavigationResource,
	resolveOdataBind,
	validateModel,
	executeModel,
	executeModels,
	deleteModel,
	getID,
	runRule,
	PinejsClient,
	api,
	runURI,
	handleODataRequest,
	executeStandardModels,
	addHook,
	setup,
}

declare namespace sbvrUtils {
	export interface SetupFunction {
		(app: _express.Application, sbvrUtils: any, db: any, done: (err: any) => void): Promise<void> | void
	}

	export interface Model {
		vocab?: string
		apiRoot: string
		modelName?: string
		modelText: string
		migrationsPath?: string
		logging: {
			[key: string]: boolean
		}
		customServerCode?: string | {
			setup: SetupFunction
		}
	}
}

export = sbvrUtils