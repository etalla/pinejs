define [
	'backbone'
	'jquery'
	'underscore'
	'cs!./config'

	# Test
	'cs!./collections/vocabulary'

	# Templates
	'dust!./templates/vocabulary'
	'dust!./templates/entity-list'
], (Backbone, $, _, config, VocabularyCollection, vocabTmpl, entityTmpl) ->

	Backbone.View.extend(

		initialize: (options = {}) ->
			Backbone.View::initialize.call(this, options)
			@vocabulary = new VocabularyCollection([], {
				url: "#{config.apiServer}/data/"
			})

		events: {
			'click .term a' : 'termClick'
		}

		setTitle: (title) ->
			@options.title.text(title)

		termClick: (e) ->
			parent = $(e.target).parent()
			resourceName = parent.data('resource')
			metaModel = @vocabulary.get(resourceName)
			MetaModel = metaModel.getModelCollection()
			list = new MetaModel()
			list.fetch({
				parse: false
			}).done(->
				entityTmpl({
					model: metaModel.toJSON()
					instances: list.toJSON()
				}, (error, out) ->
					if error?
						console.error(error)
					else
						$('.instances', parent).html(out)
				)
			)

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
	)
