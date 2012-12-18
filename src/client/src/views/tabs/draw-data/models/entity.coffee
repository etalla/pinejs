define [
	'backbone'
	'cs!./term'
], (Backbone, TermModel) ->

	EntityModel = Backbone.Model.extend({
		
		parse: (response) -> response.instances[0]
		
		url: ->
			if this.isNew()
				return "#{@urlRoot}?"
			else
				return "#{@urlRoot}?filter=#{@idAttribute}:#{@id}"
		
	
	}, {# static methods
	
		###
		Constructs and returns a new EntityModel class from the specified TermModel instance.
		@param {TermModel} term
		@return {EntityModel}
		###
		fromTerm: (term) ->
			if term not instanceof TermModel
				throw new Error("Invalid or unspecified term")
			return EntityModel.extend({
				idAttribute: term.get("idField")
				urlRoot: "#{term.urlRoot}/#{term.id}"
			})

	})
	
	return EntityModel
