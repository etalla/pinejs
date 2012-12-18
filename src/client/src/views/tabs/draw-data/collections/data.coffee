define [
	'backbone'
	'cs!../models/meta'
	'cs!../models/data'
], (Backbone, MetaModel, DataModel) ->

	DataCollection = Backbone.Collection.extend({

		model: DataModel

		parse: (response) -> response.instances

	}, {# static methods

		###
		Constructs and returns a new DataCollection Class from the specified MetaModel.
		@param {MetaModel} term
		@return {DataCollection}
		###
		fromTerm: (term) ->
			if term not instanceof MetaModel
				throw new Error("Invalid or unspecified term")
			return DataCollection.extend({
				model: DataModel.fromTerm(term)
				url: -> "#{term.urlRoot}/#{term.id}?"
			})

	})

	return DataCollection
