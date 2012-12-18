define [
	'backbone'
	'cs!../config'
], (Backbone, config) ->

	Backbone.Model.extend({

		urlRoot: "#{config.apiRoot}/data"

		idAttribute: 'resourceName'

		cachedModel: null
		cachedModelCollection: null

		###
		Returns an Entity model derived from the term
		@return {Backbone.Model}
		###
		getModel: ->
			return @cachedModel if @cachedModel isnt null

			@cachedModel = Backbone.Model.extend({
				idAttribute: this.get('idField')
				urlRoot: "#{@urlRoot}/#{@id}"
				parse: (response) ->
					response.instances[0]
				url: ->
					if @isNew()
						return "#{@urlRoot}?"
					else
						return "#{@urlRoot}?filter=#{@idAttribute}:#{@id}"
			})

			return @cachedModel

		###
		Returns an Entity Collection derived from the term
		@return {Backbone.Collection}
		###
		getModelCollection: ->
			return @cachedModelCollection if @cachedModelCollection isnt null

			@cachedModelCollection = Backbone.Collection.extend({
				url: "#{@urlRoot}/#{@id}?"
				model: this.getModel()

				parse: (response) -> response.instances
			})

			return @cachedModelCollection
	})
