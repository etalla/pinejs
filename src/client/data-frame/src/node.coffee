class Node

	###
    Enumerates the possible types of a Node.
    ###
	@LIST: "LIST"
	@EDIT: "EDIT"
	@DELETE: "DELETE"
	@CREATE: "CREATE"

	###
	Construct a new Node of the specified properties.
	@param {String} type
	@param {String} entityName
	###
	constructor: (type, entityName, instanceId) ->
		if typeof type isnt "string"
			throw new Error("Invalid value of type - expecting String, got #{typeof type}")
		if type not in [@LIST]
			throw new Error("Invalid collection node type")
		if typeof entityName isnt "string"
			throw new Error("Invalid entity name - expecting String, got #{typeof entityName}")
		if entityName is ""
			throw new Error("Entity name cannot be empty")
		@type = type
		@entityName = entityName
		@filters = []
		@children = []

	###
	Filters the node by the specified property.
	@param {String} field
	@param {String} operator
	@param {*} value
	@return {Node} to allow method chaining.
	###	
	filter: (field, operator, value) ->
		@filters.push([field, operator, value])
		return this
	
	###
	Sets a new child node.
	@param {Node} node
	@return {Node} to allow method chaining.
	###
	append: (node) ->
		@children.push(node)
		return this
	
	###
	Removes the specified child node.
	@param {Node} node
	@return {Node} to allow method chaining.
	###
	remove: (node) ->
		for child, i in children when node is child
			@children.splice(i, 1)
		return this
	