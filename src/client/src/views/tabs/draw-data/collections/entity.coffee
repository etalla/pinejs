define [
	'backbone'
	'cs!../models/term'
	'cs!../models/entity'
], (Backbone, TermModel, EntityModel) ->

	EntityCollection = Backbone.Collection.extend({

		model: EntityModel

		parse: (response) -> response.instances

	}, {# static methods

		###
		Constructs and returns a new EntityCollection Class from the specified TermModel.
		@param {TermModel} term
		@return {EntityCollection}
		###
		fromTerm: (term) ->
			if term not instanceof TermModel
				throw new Error("Invalid or unspecified term")
			return EntityCollection.extend({
				model: EntityModel.fromTerm(term)
				url: -> "#{term.urlRoot}/#{term.id}?"
			})

	})

	return EntityCollection
