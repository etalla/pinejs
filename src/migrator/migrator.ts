import * as _express from 'express'
import * as _db from '../database-layer/db'
import * as _PinejsClientCore from 'pinejs-client/core'

import * as _ from 'lodash'
import * as Promise from 'bluebird'
import TypedError = require('typed-error')
const modelText = require('./migrations.sbvr')
const permissions = require('../sbvr-api/permissions')

export type Migration = string | ((tx: _db.Tx, sbvrUtils: SbvrUtils) => any)
type MigrationTuple = [keyof Migrations, Migrations['x']]
export interface Migrations {
	[ migrationKey: string ]: Migration
}

type BluebirdPineClient = _PinejsClientCore.PinejsClientCore<null, Promise<{}>, Promise<number | _PinejsClientCore.AnyObject | _PinejsClientCore.AnyObject[]>>

interface SbvrUtils {
	api: {
		dev: BluebirdPineClient
		migrations: BluebirdPineClient & {
			logger: Console
		}
	}
}
let sbvrUtils: SbvrUtils

export const MigrationError = class MigrationError extends TypedError {}

export const run = (tx: _db.Tx, model: { apiRoot: string, migrations: Migrations}) => {
	if (!_.some(model.migrations)) {
		return Promise.resolve()
	}

	const modelName = model.apiRoot

	// migrations only run if the model has been executed before,
	// to make changes that can't be automatically applied
	return checkModelAlreadyExists(tx, modelName)
	.then((exists: boolean) => {
		if (!exists) {
			sbvrUtils.api.migrations.logger.info('First time model has executed, skipping migrations')
			return setExecutedMigrations(tx, modelName, _.keys(model.migrations))
		}

		return getExecutedMigrations(tx, modelName)
		.then((executedMigrations) => {
			const pendingMigrations = filterAndSortPendingMigrations(model.migrations, executedMigrations)
			if (!_.some(pendingMigrations)) {
				return
			}

			return executeMigrations(tx, pendingMigrations)
			.then((newlyExecutedMigrations) => {
				return setExecutedMigrations(tx, modelName, [ ...executedMigrations, ...newlyExecutedMigrations ])
			})
		})
	})
}

export const checkModelAlreadyExists = (tx: _db.Tx, modelName: string) => {
	return Promise.try(() => {
		return sbvrUtils.api.dev.get({
			resource: 'model',
			passthrough: {
				tx: tx,
				req: permissions.rootRead,
			},
			options: {
				$select: [ 'is_of__vocabulary' ],
				$top: 1,
				$filter: {
					is_of__vocabulary: modelName
				},
			},
		})
		.then(_.some)
	})
}

export const getExecutedMigrations = (tx: _db.Tx, modelName: string) => {
	return Promise.try(() => {
		return sbvrUtils.api.migrations.get({
			resource: 'migration',
			id: modelName,
			passthrough: {
				tx: tx,
				req: permissions.rootRead,
			},
			options: {
				$select: 'executed_migrations',
			},
		}).then((data): string[] => {
			return _.get(data, 'executed_migrations', [])
		})
	})
}

export const setExecutedMigrations = (tx: _db.Tx, modelName: string, executedMigrations: string[]) => {
	return Promise.try(() => {
		return sbvrUtils.api.migrations.put({
			resource: 'migration',
			id: modelName,
			passthrough: {
				tx: tx,
				req: permissions.root,
			},
			body: {
				model_name: modelName,
				executed_migrations: executedMigrations,
			},
		})
	}).return()
}

// turns {"key1": migration, "key3": migration, "key2": migration}
// into  [["key1", migration], ["key2", migration], ["key3", migration]]
export const filterAndSortPendingMigrations = (migrations: Migrations, executedMigrations: string[]) => {
	return _(migrations)
	.omit(executedMigrations)
	.toPairs()
	.sortBy(_.head)
	// Cast to the correct key/value tuple
	.value() as MigrationTuple[]
}

export const executeMigrations = (tx: _db.Tx, migrations: MigrationTuple[] = []) => {
	return Promise.mapSeries(migrations, executeMigration.bind(null, tx))
	.catch((err) => {
		sbvrUtils.api.migrations.logger.error('Error while executing migrations, rolled back')
		throw new MigrationError(err)
	})
	.return(_.map(migrations, (migration) => migration[0])) // return migration keys
}

export const executeMigration = (tx: _db.Tx, [ key, migration ]: MigrationTuple) => {
	return Promise.try(() => {
		sbvrUtils.api.migrations.logger.info(`Running migration ${JSON.stringify(key)}`)

		if (_.isString(migration)) {
			return tx.executeSql(migration)
		} else if (_.isFunction(migration)) {
			return migration(tx, sbvrUtils!)
		} else {
			throw new MigrationError(`Invalid migration type: ${typeof migration}`)
		}
	}).return()
}

export const setup = (_app: _express.Application, initialisedSbvrUtils: SbvrUtils) => {
	sbvrUtils = initialisedSbvrUtils

	return Promise.resolve()
}

export const config = {
	models: [{
		modelName: 'migrations',
		apiRoot: 'migrations',
		modelText: modelText,
		customServerCode: { setup },
	}],
}
