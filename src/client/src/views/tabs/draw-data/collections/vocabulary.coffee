define [
	'backbone'
	'cs!../models/term'
	'cs!../config'
], (Backbone, TermModel, config) ->

	Backbone.Collection.extend({
		
		url: "#{config.apiRoot}/data/"
		
		model: TermModel
		
		###
		Parses the response object and returns an array of model attributes.
		@param {Object} response
		@return {Array<Object>}
		###
		parse: (response) -> (v for own k, v of response)
	})
