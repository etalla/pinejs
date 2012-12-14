define [
	'backbone'
	'cs!../models/term'
	'cs!../config'
], (Backbone, TermModel, config) ->
	Backbone.Collection.extend({
		url: "#{config.apiRoot}/data/"
		model: TermModel
		parse: (raw) ->
			return (v for own k, v of raw)
		getEntities: ->
			@models.map((term) ->
				Backbone.Model.extend({
					idAttribute: term.get('idField')
					urlRoot: "#{@url}/#{term.get('resourceName')}"
					url: ->
						if @isNew()
							return "#{@urlRoot}?filter=#{@idAttribute}:#{@id}"
						else
							return @urlRoot
#					validate: (attrs) ->
#						console.log "asdsadsad"
#						for field in term.fields
#							value = attrs[field[1]]
#							console.log field, value
#							if value?
#								try
#									type = field[0]
#									switch type
#										when "Value"
#											validator.check(value)
#										when "Serial"
#											validator.check(value).min(0).isInteger()
#										else
#											console.log("Unknown field type: #{type}")
#								catch error
#									return error
#						return
				})
			)
	})
	
