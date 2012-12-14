define([
	'backbone'
	'jquery'
	'underscore'
	'cs!../../../../data-frame/src/ui-state'
	'cs!../../../../data-frame/src/backbone-model-generator'

	# Templates
	'dust!./templates/vocabulary'

	# Test
	'cs!./collections/vocabulary'
], (Backbone, $, _, UIState, generate, vocabTmpl, VocabularyCollection) ->
	Backbone.View.extend(
		root: "http://localhost:1337"
		vocabulary: "/data/"

		events:
			'click .term a' : 'termClick'

		setTitle: (title) ->
			@options.title.text(title)

		termClick: (e) ->
			resourceName = $(e.target).parent().data('resource')
			$.get(@root + @vocabulary + resourceName + '?', (data) ->
				console.log("Resource", resourceName, data)
			)

		render: ->
			@setTitle("Data editor")

			foo = new VocabularyCollection()
			foo.fetch().done(=>
				vocabTmpl(foo.toJSON(), (err, out) =>
					@$el.html(out)
				)
			)
	)
)
