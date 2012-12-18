define [
	'backbone'
	'jquery'
	'underscore'
	'cs!./config'

	# Test
	'cs!./collections/vocabulary'
	'cs!./collections/entity'

	# Templates
	'dust!./templates/vocabulary'
	'dust!./templates/entity-list'

], (Backbone, $, _, config, VocabularyCollection, EntityCollection, vocabTmpl, entityTmpl) ->

	Backbone.View.extend(

		initialize: (options = {}) ->
			Backbone.View::initialize.call(this, options)
			@vocabulary = new VocabularyCollection([], {
				url: "#{config.apiServer}/data/"
			})
			return

		events: {
			'click .term a' : 'termClick'
		}

		setTitle: (title) ->
			@options.title.text(title)
			return this

		termClick: (e) ->
			parent = $(e.target).parent()
			resourceName = parent.data('resource')
			term = @vocabulary.get(resourceName)
			Entities = EntityCollection.fromTerm(term)
			entities = new Entities()
			entities.fetch({
				parse: false
			}).done(->
				entityTmpl({
					model: term.toJSON()
					instances: entities.toJSON()
				}, (error, out) ->
					if error?
						console.error(error)
					else
						$('.instances', parent).html(out)
				)
			).fail((error) ->
				console.error(error)
			)
			return this

		render: ->
			this.setTitle("Data editor")
			@vocabulary.fetch().done(=>
				vocabTmpl(@vocabulary.toJSON(), (error, out) =>
					if error?
						console.error(error)
					else
						@$el.html(out)
				)
			)
			return this

	)
