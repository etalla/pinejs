define [
	'backbone'
	'cs!./meta'
], (Backbone, MetaModel) ->

	DataModel = Backbone.Model.extend({
		
		parse: (response) -> response.instances[0]
		
		url: ->
			if this.isNew()
				return "#{@urlRoot}?"
			else
				return "#{@urlRoot}?filter=#{@idAttribute}:#{@id}"
		
	
	}, {# static methods
	
		###
		Constructs and returns a new DataModel class from the specified MetaModel instance.
		@param {MetaModel} term
		@return {DataModel}
		###
		fromTerm: (term) ->
			if term not instanceof MetaModel
				throw new Error("Invalid or unspecified term")
			return DataModel.extend({
				idAttribute: term.get("idField")
				urlRoot: "#{term.urlRoot}/#{term.id}"
			})

	})
	
	return DataModel
