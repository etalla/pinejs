define(['underscore'], (_) ->
	
	getField = (table, fieldName) ->
		tableFields = table.fields
		for tableField in tableFields when tableField[1] == fieldName
			return tableField
		return false
	
	splitID = (id) ->
		parts = id.split(',')
		if parts.length == 1
			return parts
		return (part for part in parts[1..] by 2)
	
	return (sqlModel) ->
		tables = sqlModel.tables
		resources = {}
		resourceToSQLMappings = {}
		###*
		*	resourceToSQLMappings =
		*		[resourceName][resourceField] = [sqlTableName, sqlFieldName]
		###
		addMapping = (resourceName, resourceField, sqlTableName, sqlFieldName) ->
			resourceToSQLMappings[resourceName][resourceField] = [sqlTableName, sqlFieldName]
		for id, table of tables
			idParts = splitID(id)
			resourceName = (part.replace(/\s/g, '_') for part in idParts).join('-')
			resourceToSQLMappings[resourceName] = {}
			if _.isString(table)
				sqlTable = tables[idParts[0]]
				sqlFieldName = sqlTable.idField
				resourceField = sqlTableName = sqlTable.name
				addMapping(resourceName, resourceField, sqlTableName, sqlFieldName)
				resources[resourceName] =
					name: resourceName
					fields: [ ['ForeignKey', resourceField, 'NOT NULL', sqlFieldName] ]
					idField: resourceField
					# TODO: value field is really reference scheme?
					valueField: resourceField
					actions: ['view', 'add', 'delete']
				switch table
					when 'Attribute', 'ForeignKey'
						# person has age
						# person: fk - id
						# age: fk
						resourceField = sqlFieldName = tables[idParts[2]].name
						sqlTableName = sqlTable.name
						addMapping(resourceName, resourceField, sqlTableName, sqlFieldName)
						resources[resourceName].fields.push(getField(sqlTable, sqlFieldName))
						resources[resourceName].valueField = resourceField
					when 'BooleanAttribute'
						# person is old
						# person: fk - id
					else
						throw 'Unrecognised table type'
			else
				resources[resourceName] =
					name: resourceName
					fields: table.fields
					idField: table.idField
					valueField: table.valueField
					actions: ['view', 'add', 'edit', 'delete']
				for sqlField in table.fields
					addMapping(resourceName, sqlField[1], table.name, sqlField[1])
		return {resources, resourceToSQLMappings}
)