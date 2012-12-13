define [
	'backbone'
	'cjs!validator'
], (Backbone, validator) ->

	generate = (namespace) ->
		# get the client model
		clientModel = {
		  "resources":{
		     "pilot":{
		        "resourceName":"pilot",
		        "modelName":"pilot",
		        "topLevel":true,
		        "fields":[
		           [
		              "Serial",
		              "id",
		              true,
		              "PRIMARY KEY",
		              null
		           ],
		           [
		              "Value",
		              "value",
		              true,
		              null,
		              null
		           ],
		           [
		              "Boolean",
		              "is experienced",
		              true,
		              null,
		              null
		           ]
		        ],
		        "idField":"id",
		        "valueField":"value",
		        "actions":[
		           "view",
		           "add",
		           "edit",
		           "delete"
		        ]
		     },
		     "plane":{
		        "resourceName":"plane",
		        "modelName":"plane",
		        "topLevel":true,
		        "fields":[
		           [
		              "Serial",
		              "id",
		              true,
		              "PRIMARY KEY",
		              null
		           ],
		           [
		              "Value",
		              "value",
		              true,
		              null,
		              null
		           ]
		        ],
		        "idField":"id",
		        "valueField":"value",
		        "actions":[
		           "view",
		           "add",
		           "edit",
		           "delete"
		        ]
		     },
		     "pilot-can_fly-plane":{
		        "resourceName":"pilot-can_fly-plane",
		        "modelName":"pilot can fly plane",
		        "topLevel":false,
		        "fields":[
		           [
		              "ForeignKey",
		              "pilot",
		              true,
		              "",
		              "id"
		           ],
		           [
		              "ForeignKey",
		              "plane",
		              true,
		              "",
		              "id"
		           ],
		           [
		              "Serial",
		              "id",
		              true,
		              "PRIMARY KEY",
		              null
		           ]
		        ],
		        "idField":"id",
		        "actions":[
		           "view",
		           "add",
		           "edit",
		           "delete"
		        ]
		     },
		     "pilot-is_experienced":{
		        "resourceName":"pilot-is_experienced",
		        "modelName":"pilot is experienced",
		        "topLevel":false,
		        "fields":[
		           [
		              "ForeignKey",
		              "pilot",
		              "NOT NULL",
		              "id"
		           ],
		           [
		              "Boolean",
		              "is experienced",
		              true,
		              null,
		              null
		           ]
		        ],
		        "idField":"pilot",
		        "valueField":"is experienced",
		        "actions":[
		           "view",
		           "add",
		           "delete"
		        ]
		     }
		  },
		  "resourceToSQLMappings":{
		     "pilot":{
		        "id":[
		           "pilot",
		           "id"
		        ],
		        "value":[
		           "pilot",
		           "value"
		        ],
		        "is experienced":[
		           "pilot",
		           "is experienced"
		        ]
		     },
		     "plane":{
		        "id":[
		           "plane",
		           "id"
		        ],
		        "value":[
		           "plane",
		           "value"
		        ]
		     },
		     "pilot-can_fly-plane":{
		        "pilot":[
		           "pilot-can_fly-plane",
		           "pilot"
		        ],
		        "plane":[
		           "pilot-can_fly-plane",
		           "plane"
		        ],
		        "id":[
		           "pilot-can_fly-plane",
		           "id"
		        ]
		     },
		     "pilot-is_experienced":{
		        "pilot":[
		           "pilot",
		           "id"
		        ],
		        "is experienced":[
		           "pilot",
		           "is experienced"
		        ]
		     }
		  }
	   }
		models = {}
		for own k, v of clientModel.resources
			# set model default attribute values
			defaults = {}
			for x in v.fields
				defaults[x[1]] = x[4]
			# extend model
			models[k] = Backbone.Model.extend({
				defaults
				idAttribute: v.idField
				urlRoot: "#{namespace}/#{v.resourceName}"
				url: ->
					if @id?
						return "#{@urlRoot}?filter=#{@idAttribute}:#{@id}"
					else
						return @urlRoot
				validate: (attrs) ->
					console.log "asdsadsad"
					for field in v.fields
						value = attrs[field[1]]
						console.log field, value
						if value?
							try
								type = field[0]
								switch type
									when "Value"
										validator.check(value)
									when "Serial"
										validator.check(value).min(0).isInteger()
									else
										console.log("Unknown field type: #{type}")
							catch error
								return error
					return
			})
		return models
	
	return generate