define [
	'backbone'
	'jquery'
	'underscore'
	'cs!./config'

	# Test
	'cs!./collections/meta'
	'cs!./collections/data'

	# Templates
	'dust!./templates/vocabulary'
	'dust!./templates/entity-list'

], (Backbone, $, _, config, MetaCollection, DataCollection, vocabTmpl, entityTmpl) ->

	Backbone.View.extend(

		initialize: (options = {}) ->
			Backbone.View::initialize.call(this, options)
			@collection = new MetaCollection([], {
				url: "#{config.apiServer}/data/"
			})
			return

		events: {
			'click .term a' : 'termClick'
			'click .instances tbody tr' : 'editInstance'
		}

		setTitle: (title) ->
			@options.title.text(title)
			return this

		termClick: (e) ->
			parent = $(e.target).parent()
			resourceName = parent.data('resource')
			term = @vocabulary.get(resourceName)
			Entities = DataCollection.fromTerm(term)
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

		editInstance: (e) ->
			console.log e
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
