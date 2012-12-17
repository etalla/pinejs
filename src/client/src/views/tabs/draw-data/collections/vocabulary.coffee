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
		
		###
		Returns an array of Entity models derived from the terms of the vocabulary.
		@return {Array<Backbone.Model>}
		###
		getEntities: ->
			entities = {}
			for term in @models
				entities[term.id] = Backbone.Model.extend({
					idAttribute: term.get('idField')
					urlRoot: "#{@url}#{term.id}"
					parse: (response) -> response.instances
					url: ->
						if @isNew()
							return "#{@urlRoot}?"
						else
							return "#{@urlRoot}?filter=#{@idAttribute}:#{@id}"
						
				})
			return entities
				
	})