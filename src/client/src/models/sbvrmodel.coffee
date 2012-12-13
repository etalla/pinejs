define [
	'cs!config'
	'backbone'
	'ometa!sbvr-parser/SBVRParser'
	'ometa!sbvr-compiler/LF2AbstractSQLPrep'
	'ometa!sbvr-compiler/LF2AbstractSQL'
	'cs!sbvr-compiler/AbstractSQL2SQL'
	'cs!sbvr-compiler/AbstractSQL2CLF'
], (config, Backbone, SBVRParser, LF2AbstractSQLPrep, LF2AbstractSQL, AbstractSQL2SQL, AbstractSQL2CLF) ->
	Backbone.Model.extend({
		defaults:
			id: null
			content: ''
		compile: -> SBVRParser.matchAll(this.get('content'), 'Process')
		toClientModel: ->
			lfModel = SBVRParser.matchAll(this.get('content'), 'Process')
			slfModel = LF2AbstractSQLPrep.match(lfModel, 'Process')
			abstractSqlModel = LF2AbstractSQL.match(slfModel, 'Process')
			sqlModel = AbstractSQL2SQL.websql.generate(abstractSqlModel)
			return AbstractSQL2CLF(sqlModel)
		urlRoot: config.apiServer + 'v1/models'
	})
