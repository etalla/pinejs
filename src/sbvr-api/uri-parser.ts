import * as _AbstractSQLCompiler from '@resin/abstract-sql-compiler'

import * as Promise from 'bluebird'
import TypedError = require('typed-error')
const { ODataParser } = require('@resin/odata-parser')
interface OData2AbstractSQLInstance {
	match: (abstractSQL: ODataQuery, rule: 'Process', args: [SupportedMethod, string[]]) => {
		tree: _AbstractSQLCompiler.AbstractSqlQuery,
		extraBodyVars: {},
	}
	setClientModel: (abstractSqlModel: _AbstractSQLCompiler.AbstractSqlModel) => void
}
const { OData2AbstractSQL }: {
	OData2AbstractSQL: {
		createInstance: () => OData2AbstractSQLInstance
	}
} = require('@resin/odata-to-abstract-sql')
import * as memoize from 'memoizee'
import * as _ from 'lodash'

export class TranslationError extends TypedError {}
export class ParsingError extends TypedError {}
export class BadRequestError extends TypedError {}

type SupportedMethod = "GET" | "PUT" | "POST" | "PATCH" | "MERGE" | "DELETE" | "OPTIONS"
type ODataQuery = any[]

export interface UnparsedRequest {
	method: string
	url: string
	data: any
	headers?: { [header: string]: string }
	changeSet?: UnparsedRequest[]
	_isChangeSet?: boolean
}

export interface ODataRequest {
	method: SupportedMethod
	odataQuery: ODataQuery
	odataBinds: any[]
	values: any[]
	abstractSqlQuery?: _AbstractSQLCompiler.AbstractSqlQuery | _AbstractSQLCompiler.AbstractSqlQuery[]
	sqlQuery?: _AbstractSQLCompiler.SqlResult | _AbstractSQLCompiler.SqlResult[]
	resourceName: string
	vocabulary: string
	_defer?: boolean
	id?: number
	custom?: {
		[ key: string ]: any
	}
}

const odataParser = ODataParser.createInstance()
const odata2AbstractSQL: {
	[vocabulary: string]: OData2AbstractSQLInstance
} = {}

// Converts a value to its string representation and tries to parse is as an
// OData bind
export const parseId = (b: any) => {
	return ODataParser.matchAll(String(b), 'ExternalKeyBind')
}

const memoizedOdata2AbstractSQL = (() => {
	const memoizedOdata2AbstractSQL = memoize(
		(vocabulary: string, odataQuery: ODataQuery, method: SupportedMethod, bodyKeys: string[]) => {
			try {
				return odata2AbstractSQL[vocabulary].match(odataQuery, 'Process', [method, bodyKeys])
			} catch (e) {
				console.error('Failed to translate url: ', JSON.stringify(odataQuery, null, '\t'), method, e, e.stack)
				throw new TranslationError('Failed to translate url')
			}
		},
		{ normalizer: JSON.stringify }
	)
	return (vocabulary: string, odataQuery: ODataQuery, method: SupportedMethod, body: {}) => {
		// Sort the body keys to improve cache hits
		const { tree, extraBodyVars } = memoizedOdata2AbstractSQL(vocabulary, odataQuery, method, _.keys(body).sort())
		_.assign(body, extraBodyVars)
		return _.cloneDeep(tree)
	}
})()

export const metadataEndpoints = [ '$metadata', '$serviceroot' ]

const notBadRequestOrParsingError = (e: Error) => {
	return !((e instanceof BadRequestError) || (e instanceof ParsingError))
}

export const parseOData = (b: UnparsedRequest) => {
	return Promise.try<ODataRequest | ODataRequest[]>(() => {
		if (b._isChangeSet && b.changeSet != null) {
			const env = new Map<ODataRequest['id'], ODataRequest>()
			// We sort the CS set once, we must assure that requests which reference
			// other requests in the changeset are placed last. Once they are sorted
			// Map will guarantee retrival of results in insertion order
			const sortedCS = _.sortBy(b.changeSet, (el) => el.url[0] !== '/')
			return Promise.reduce(sortedCS, parseODataChangeset, env)
			.then((env) => Array.from(env.values()) as ODataRequest[])
		} else {
			const { url, apiRoot } = splitApiRoot(b.url)
			const odata = odataParser.matchAll(url, 'Process')

			return {
				method: b.method as SupportedMethod,
				vocabulary: apiRoot,
				resourceName: odata.tree.resource,
				odataBinds: odata.binds,
				odataQuery: odata.tree,
				values: b.data,
				custom: {},
				_defer: false,
			}
		}
	}).catch(SyntaxError, () => {
		throw new BadRequestError(`Malformed url: '${b.url}'`)
	}).catch(notBadRequestOrParsingError, (e) => {
		console.error('Failed to parse url: ', b.method, b.url, e, e.stack)
		throw new ParsingError(`Failed to parse url: '${b.url}'`)
	})
}

const parseODataChangeset = (env: Map<ODataRequest['id'], ODataRequest>, b: UnparsedRequest) => {
	const contentId: ODataRequest['id'] = mustExtractHeader(b, 'content-id')

	if (env.has(contentId)) {
		throw new BadRequestError('Content-Id must be unique inside a changeset')
	}

	let defer: boolean
	let odata
	let apiRoot: string
	let url

	if (b.url[0] === '/') {
		({ url, apiRoot } = splitApiRoot(b.url))
		odata = odataParser.matchAll(url, 'Process')
		defer = false
	} else {
		url = b.url
		odata = odataParser.matchAll(url, 'Process')
		const { bind } = odata.tree.resource
		const [ , id ] = odata.binds[bind]
		// Use reference to collect information
		const ref = env.get(id)
		if (_.isUndefined(ref)) {
			throw new BadRequestError('Content-Id refers to a non existent resource')
		}
		apiRoot = ref.vocabulary
		// Update resource with actual resourceName
		odata.tree.resource = ref.resourceName
		defer = true
	}

	const parseResult: ODataRequest = {
		method: b.method as SupportedMethod,
		vocabulary: apiRoot,
		resourceName: odata.tree.resource,
		odataBinds: odata.binds,
		odataQuery: odata.tree,
		values: b.data,
		custom: {},
		id: contentId,
		_defer: defer,
	}
	env.set(contentId, parseResult)
	return env
}

const splitApiRoot = (url: string) => {
	let urlParts = url.split('/')
	const apiRoot = urlParts[1]
	if (apiRoot == null || odata2AbstractSQL[apiRoot] == null) {
		throw new ParsingError(`No such api root: ${apiRoot}`)
	}
	url = '/' + urlParts.slice(2).join('/')
	return { url: url, apiRoot: apiRoot }
}

const mustExtractHeader = (body: { headers?: { [header: string]: string } }, header: string) => {
	const h: any = _.get(body.headers, [header, 0])
	if (_.isEmpty(h)) {
		throw new BadRequestError(`${header} must be specified`)
	}
	return h
}

export const translateUri = ({ method, vocabulary, resourceName, odataBinds, odataQuery, values, custom, id, _defer }: ODataRequest): ODataRequest => {
	const isMetadataEndpoint = resourceName in metadataEndpoints || method === 'OPTIONS'
	if (!isMetadataEndpoint) {
		const abstractSqlQuery = memoizedOdata2AbstractSQL(vocabulary, odataQuery, method, values)
		return {
			method,
			vocabulary,
			resourceName,
			odataBinds,
			odataQuery,
			abstractSqlQuery,
			values,
			custom,
			id,
			_defer,
		}
	}
	return {
		method,
		vocabulary,
		resourceName,
		odataBinds,
		odataQuery,
		values,
		custom,
		id,
		_defer,
	}
}

export const addClientModel = (vocab: string, clientModel: _AbstractSQLCompiler.AbstractSqlModel) => {
	odata2AbstractSQL[vocab] = OData2AbstractSQL.createInstance()
	odata2AbstractSQL[vocab].setClientModel(clientModel)
}

export const deleteClientModel = (vocab: string) => {
	delete odata2AbstractSQL[vocab]
}
