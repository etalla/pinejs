window.model1 = '''
Term:      pilot
Term:      plane
Fact type: pilot can fly plane
Fact type: pilot is experienced
Rule:      It is obligatory that each pilot can fly at least 1 plane
Rule:      It is obligatory that each pilot that is experienced can fly at least 3 planes
'''

window.model2 = '''
Term:      student
Term:      course
Term:      study programme
Fact type: student is registered for course
Fact type: student is enrolled in study programme
Fact type: course is available for study programme 
Rule:      It is obligatory that each student is registered for at most 5 course

Rule:      It is obligatory that each student that is registered for a course is enrolled in a study programme that the course is available for

Fact type: student is under probation
Rule:      It is obligatory that each student that is under probation is registered for at most 3 courses

Term:      lecturer
Term:      grade
Fact type: student is marked with grade by lecturer for course
Rule:      It is obligatory that each student is marked with a grade by a lecturer for each course that the student is registered for
'''

window.model3 = '''
Term:      student
Fact type: student is school president
Rule:      It is obligatory that a student is school president
Term:      module
Fact type: student is registered for module
Rule:      It is obligatory that each student is registered for at most 5 modules
Term:      study programme
Fact type: student is enrolled in study programme
Fact type: module is available for study programme
Rule:      It is obligatory that each student that is registered for a module is enrolled in a study programme that the module is available for
Term:      lecturer
Fact type: student is under probation
Rule:      It is obligatory that each student is registered for at most 5 modules
Rule:      It is obligatory that each student that is under probation is registered for at most 3 modules
Rule:      It is obligatory that at most 10 students are under probation
Fact type: lecturer grades student for study programme with grade
Rule:      It is prohibited that a student that is under probation is enrolled in more than 2 study programmes
Rule:      It is obligatory that each student is registered for each module
'''