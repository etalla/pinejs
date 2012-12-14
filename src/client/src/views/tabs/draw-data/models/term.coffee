define [
	'backbone'
	'cs!../config'
], (Backbone, config) ->
	Backbone.Model.extend({
		urlRoot: config.apiRoot + '/data'
		idAttribute: 'resourceName'
		
		constructor: ->
			
	})
	
