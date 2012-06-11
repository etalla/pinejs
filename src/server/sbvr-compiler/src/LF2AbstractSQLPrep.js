define(["sbvr-compiler/LFOptimiser"], (function(LFOptimiser) {
    var LF2AbstractSQLPrep = undefined;
    LF2AbstractSQLPrep = objectThatDelegatesTo(LFOptimiser, {
        "univQ": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                v, xs;
            v = this._applyWithArgs("token", "var");
            xs = this._many((function() {
                return this._apply("trans")
            }));
            this._apply("SetHelped");
            return ["neg", ["existQ", v, ["neg"].concat(xs)]]
        },
        "atMostQ": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                a, v, xs;
            a = this._applyWithArgs("token", "maxCard");
            v = this._applyWithArgs("token", "var");
            xs = this._many((function() {
                return this._apply("trans")
            }));
            this._apply("SetHelped");
            return (function() {
                a[(1)][(1)]++;
                return ["neg", ["atLeastQ", ["minCard", a[(1)]], v].concat(xs)]
            }).call(this)
        },
        "ForeignKey": function(v1) {
            var $elf = this,
                _fromIdx = this.input.idx,
                card, v2, atomicForm, factType;
            this._pred((v1["length"] == (3)));
            this._or((function() {
                return this._form((function() {
                    this._applyWithArgs("exactly", "exactQ");
                    card = this._applyWithArgs("token", "card");
                    this._pred((card[(1)][(1)] == (1)));
                    v2 = this._applyWithArgs("token", "var");
                    this._pred((v2["length"] == (3)));
                    atomicForm = this._applyWithArgs("token", "aFrm");
                    factType = atomicForm[(1)];
                    this._pred(((((atomicForm["length"] == (4)) && (factType["length"] == (4))) && (v1[(2)][(1)] == factType[(1)][(1)])) && (v2[(2)][(1)] == factType[(3)][(1)])));
                    return (this["foreignKeys"][factType] = "NOT NULL")
                }))
            }), (function() {
                return this._form((function() {
                    this._applyWithArgs("exactly", "atMostQ");
                    card = this._applyWithArgs("token", "maxCard");
                    this._pred((card[(1)][(1)] == (1)));
                    v2 = this._applyWithArgs("token", "var");
                    this._pred((v2["length"] == (3)));
                    atomicForm = this._applyWithArgs("token", "aFrm");
                    factType = atomicForm[(1)];
                    this._pred(((((atomicForm["length"] == (4)) && (factType["length"] == (4))) && (v1[(2)][(1)] == factType[(1)][(1)])) && (v2[(2)][(1)] == factType[(3)][(1)])));
                    return (this["foreignKeys"][factType] = "NULL")
                }))
            }));
            return this._apply("SetHelped")
        },
        "rule": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                v1;
            return this._or((function() {
                this._form((function() {
                    this._applyWithArgs("exactly", "obl");
                    return this._form((function() {
                        return (function() {
                            switch (this._apply('anything')) {
                            case "univQ":
                                return (function() {
                                    v1 = this._applyWithArgs("token", "var");
                                    return this._applyWithArgs("ForeignKey", v1)
                                }).call(this);
                            case "neg":
                                return this._form((function() {
                                    this._applyWithArgs("exactly", "existQ");
                                    v1 = this._applyWithArgs("token", "var");
                                    return this._form((function() {
                                        this._applyWithArgs("exactly", "neg");
                                        return this._applyWithArgs("ForeignKey", v1)
                                    }))
                                }));
                            default:
                                throw fail
                            }
                        }).call(this)
                    }))
                }));
                this._applyWithArgs("token", "text");
                return null
            }), (function() {
                return LFOptimiser._superApplyWithArgs(this, 'rule')
            }))
        }
    });
    (LF2AbstractSQLPrep["initialize"] = (function() {
        this["__proto__"].initialize();
        (this["foreignKeys"] = [])
    }));
    (LF2AbstractSQLPrep["defaultAttributes"] = (function(termOrVerb, attrsFound, attrs) {
        if ((!attrsFound.hasOwnProperty("DatabaseIDField"))) {
            attrs.push(["DatabaseIDField", "id"]);
            this.SetHelped()
        } else {
            undefined
        };
        switch (termOrVerb[(0)]) {
        case "term":
            {
                if ((!attrsFound.hasOwnProperty("DatabaseNameField"))) {
                    attrs.push(["DatabaseNameField", "_name"]);
                    this.SetHelped()
                } else {
                    undefined
                }
                if ((!attrsFound.hasOwnProperty("DatabaseTableName"))) {
                    attrs.push(["DatabaseTableName", termOrVerb[(1)].replace(new RegExp(" ", "g"), "_")]);
                    this.SetHelped()
                } else {
                    undefined
                }
                break
            };
        case "fcTp":
            {
                if ((!attrsFound.hasOwnProperty("DatabaseTableName"))) {
                    var tableName = termOrVerb[(1)][(1)].replace(new RegExp(" ", "g"), "_");
                    for (var i = (2);
                    (i < termOrVerb["length"]); i++) {
                        (tableName += ("-" + termOrVerb[i][(1)].replace(new RegExp(" ", "g"), "_")))
                    };
                    attrs.push(["DatabaseTableName", tableName]);
                    this.SetHelped()
                } else {
                    undefined
                }
                if (this["foreignKeys"].hasOwnProperty(termOrVerb)) {
                    console.log("Adding FK attr");
                    attrs.push(["ForeignKey", this["foreignKeys"][termOrVerb]]);
                    (delete this["foreignKeys"][termOrVerb]);
                    this.SetHelped()
                } else {
                    undefined
                }
                break
            }
        };
        termOrVerb.push(attrs)
    }));
    return LF2AbstractSQLPrep
}))