coffeeTasks = jake.rmutils.coffeeCompileNamespace(__dirname)
ometaTasks = jake.rmutils.ometaCompileNamespace(__dirname)
jake.rmutils.boilerplate(coffeeTasks.concat(ometaTasks))