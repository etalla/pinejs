define [
	'backbone'
	'jquery'
	'underscore'
	'cs!./config'

	# Templates
	'dust!./templates/vocabulary'

	# Test
	'cs!./collections/vocabulary'
], (Backbone, $, _, config, vocabTmpl, VocabularyCollection) ->

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
			resourceName = $(e.target).parent().data('resource')
			Model = @vocabulary.getEntities()[resourceName]
			model = new Model()
			model.fetch({
				id: 1
			}).done((data) ->
				console.log model.toJSON()
			)
			return			
			$.get(@root + @vocabulary + resourceName + '?', (data) ->
				console.log("Resource", resourceName, data)
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
