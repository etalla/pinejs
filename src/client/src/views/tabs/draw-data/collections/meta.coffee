define [
	'backbone'
	'cs!../models/meta'
	'cs!../config'
], (Backbone, MetaModel, config) ->

	Backbone.Collection.extend({
		
		url: "#{config.apiRoot}/data/"
		
		model: MetaModel
		
		###
		Parses the response object and returns an array of model attributes.
		@param {Object} response
		@return {Array<Object>}
		###
		parse: (response) -> (v for own k, v of response)
	})
