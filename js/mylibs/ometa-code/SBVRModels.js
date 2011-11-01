{
    (model1 = "Term: pilot\r\nTerm: plane\r\nFact: pilot can fly plane\r\nFact: pilot is experienced\r\nRule: It is obligatory that each pilot can fly at least 1 plane\r\nRule: It is obligatory that each pilot that is experienced can fly at least 3 planes");
    (model2 = "Term: student\r\nFact: student is school president\r\nRule: It is obligatory that a student is school president\r\nTerm: module\r\nFact: student is registered for module\r\nRule: It is obligatory that each student is registered for at most 5 modules\r\nTerm: study programme\r\nFact: student is enrolled in study programme\r\nFact: module is available for study programme\r\nRule: It is obligatory that each student that is registered for a module is enrolled in a study programme that the module is available for\r\nTerm: lecturer\r\nFact: student is under probation\r\nRule: It is obligatory that each student is registered for at most 5 modules\r\nRule: It is obligatory that each student that is under probation is registered for at most 3 modules\r\nRule: It is obligatory that at most 10 students are under probation\r\nFact: lecturer grades student for study programme with grade\r\nRule: It is prohibited that a student that is under probation is enrolled in more than 2 study programmes\r\nRule: It is obligatory that each student is registered for each module");
    (model3 = "Term: student\r\nTerm: module\r\nTerm: study programme\r\nFact: student is registered for module\r\nFact: student is enrolled in study programme\r\nFact: module is available for study programme\r\nRule: It is obligatory that each student is registered for at most 5 modules\r\nRule: It is obligatory that each student that is registered for a module is enrolled in a study programme that the module is available for\r\nFact: student is under probation\r\nRule: It is obligatory that each student that is under probation is registered for at most 3 modules");
    (modelTest = ((((((((((((((((((((((("Term: person\r\nTerm: student\r\n\tDefinition: A definition\r\n\tSource: A source\r\n\tDictionary Basis: A dictionary basis\r\n\tGeneral ConcepTerm: A general concept\r\n\tConcept Type: person\r\n\tNecessity: A necessity\r\n\tPossibility: A possibility\r\n\tReference Scheme: A reference scheme\r\n\tNote: A note\r\n\tExample: An example\r\n\tSynonym: A synonym\r\n\tSynonymous Form: A synonymous form\r\n\tSee: Something to see\r\n\tSubject Field: A subject field\r\n\tNamespace URI: A namespace URI\r\n\tDatabase Table Name: student_table\r\n\tDatabase ID Field: id_field\r\n\tDatabase Name Field: name_field\r\nTerm: lecturer\r\n\tConcept Type: person\r\nTerm: module " + "\r\nFact: student is school president ") + "\r\nFact: student is registered for module") + "\r\nFact: student is registered for module to catchup") + "\r\nFact: student is registered for module with lecturer") + "\r\nFact: person is swimming") + "\r\nRule: It is obligatory that\ta student is school president") + "\r\nRule: It is necessary that\t\ta student is school president") + "\r\nRule: It is possible that\t\ta student is school president") + "\r\nRule: It is permissible that\ta student is school president") + "\r\n\r\nRule: It is prohibited that\tsome students are school president") + "\r\nRule: It is impossible that\tsome students are school president") + "\r\nRule: It is not possible that\tsome students are school president") + "\r\nRule: It is obligatory that each\tstudent\t\tis registered for at least one module") + "\r\nRule: It is obligatory that a \t\tstudent\t\tis registered for at least one module") + "\r\nRule: It is obligatory that an\t\tstudent\t\tis registered for at least one module") + "\r\nRule: It is obligatory that some\tstudents\tare registered for at least one module") + "\r\nRule: It is obligatory that at most 50\t\tstudents are registered for at least one module") + "\r\nRule: It is obligatory that at least one\tstudent is registered for at least one module") + "\r\nRule: It is obligatory that more than 0\tstudents are registered for at least one module") + "\r\nRule: It is obligatory that exactly one\tstudent is school president") + "\r\nRule: It is obligatory that at least one and at most 50\tstudents are registered for at least one module") + "\r\nRule: It is obligatory that a student is registered for a module with a lecturer") + "\r\nRule: It is obligatory that exactly 0 people are swimming"));
    (modelT = "Term: resource\r\nTerm: transaction\r\nTerm: lock\r\nTerm: conditional representation\r\nFact: lock is exclusive\r\nFact: lock is shared\r\nFact: resource is under lock\r\nFact: lock belongs to transaction\r\nRule: It is obligatory that each resource is under at most 1 lock that is exclusive")
}