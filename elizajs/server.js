const express = require('express');
const mysql = require('mysql');
const http = require("http");
const app = express();
const server = http.createServer(app);
const io = require("socket.io")(server);
const fs = require("fs");


const usernameRegex = /^[a-zA-Z0-9]{1,31}$/;
const passwordRegex = /^[a-zA-Z0-9]{3,63}$/;
const genderRegex = /^[mfx]?$/; // 'm' male, 'f' female, 'x' genderless, '' unknown
const invalidMessageRegex = /[\[\]/"`\n\\]/; //invalid characters
const invalidTermRegex = /\[\]\/\//; //invalid characters.

const min_term_size = 1;
const max_term_size = 127;
const min_operator_size = 1;
const max_operator_size = 15;


var DB = {
    HOST: undefined,
    PORT: undefined,
    USER: undefined,
    DATABASE: undefined,
    PASS: undefined
};
fs.readFile("credentials.json", function (err, data) {
    if (err) throw err;
    DB = JSON.parse(data);
    console.log("set DB connection details: \n", DB)
});

//changed to localhost. 


//maximum rows to send to client.
var QUERY_MAXROWS = 5;

function attemptSetDBPass(new_db_pass) {
    //check pass is valid.
    console.log("Attempting to set DB_PASS to " + new_db_pass);
    let conn = mysql.createConnection({
        host: DB.HOST,
        user: DB.USER,
        password: new_db_pass,
        port: DB.PORT,
        database: DB.DATABASE
    });
    conn.connect(function (err) {
        if (err) {
            console.log("DB_PASS not set: " + err);
        }
        else {
            DB.PASS = new_db_pass;
            console.log("DB_PASS set.");
        }
        conn.end();
    });
}
function validUsername(username) {
    return username.match(usernameRegex) && username.toLowerCase() !== "eliza";
}

app.use(express.static("public"));
app.get("/set_db_pass", function (req, res) {
    if (DB.PASS) {
        res.statusCode = 400;
        res.send("DB_PASS is already set.");
    }
    else {
        //set the db password. HTTPS ensures security.
        let new_db_pass = req.query.pass;
        if (new_db_pass) {
            attemptSetDBPass(new_db_pass);
            res.statusCode = 200;
            res.send("if DB_PASS is valid it has been updated. You will not see this message again if DB_PASS is set.")
        }
        else {
            res.statusCode = 400;
            res.send("include pass parameter to set DB_PASS.")
        }
    }
});
let args = process.argv;
if (args[2]) {
    let new_db_pass = args[2];
    attemptSetDBPass(new_db_pass);
}

function createConnection() {
    return mysql.createConnection({
        host: DB.HOST,
        user: DB.USER,
        password: DB.PASS,
        port: DB.PORT,
        database: DB.DATABASE
    });
}

function validateFact(fact) {
    /**
     * fact object must have (at least) these attributes:
     * fact: {
     *  term1: string, (valid term)
     *  operator: string, (valid term)
     *  term2: string, (valid term)
     *  negotiator: {
     *      username: string, (valid username)
     *   }
     * }
     */
    //this function uses 'truthiness'. you might want to search for this in google. :)
    if (fact) {
        if (fact.term1 && fact.term2 && fact.operator && fact.negotiator) {
            if (!(fact.term1.match(invalidTermRegex) || fact.operator.match(invalidTermRegex) || fact.term2.match(invalidTermRegex))) {
                if (fact.term1.length >= min_term_size && fact.term1.length <= max_term_size) {
                    if (fact.operator.length >= min_operator_size && fact.operator.length <= max_operator_size) {
                        if (fact.term2.length >= min_term_size && fact.term2.length <= max_term_size) {
                            if (fact.negotiator.username) {
                                if (validUsername(fact.negotiator.username)) {
                                    //valid fact.
                                    return true;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    return false;
}

server.listen(8030, function () {
    console.log("App running on localhost:8030");
});

io.on("connection", function (socket) {
    socket.on("sign_on", function (data) {
        console.log("sign on request received for username: '" + data.username + "'");
        //validate sign on.
        if (data.username.match(usernameRegex)) {
            if (data.password ? data.password.match(passwordRegex) : true) {
                //check if a user already exists with that username.
                let conn = createConnection();
                conn.connect(function (err) {
                    if (err) {
                        if (err.code === "ER_ACCESS_DENIED_ERROR") {
                            console.log(err);
                            socket.emit("sign_on_result", { success: false, reason: "The server's DB_PASS parameter has not been set. " })
                        }
                    }
                    else {
                        //db connection successful. query ElizaAcquaintance.
                        let d = new Date();
                        let sql = `SELECT password, meeting_date FROM ElizaAcquaintance WHERE username=${mysql.escape(data.username)};`;
                        conn.query(sql, function (err, results) {
                            if (err) console.log(sql + err);
                            else if (results) {
                                if (results.length > 0) {
                                    let user = results[0]; //first entry in array. guaranteed to have 1 or 0 as username is PK.
                                    //user exists. check password.
                                    if (data.password === user.password) {
                                        //correct password.
                                        console.log("User '" + data.username + "' signed on.")
                                        socket.emit("sign_on_result", { success: true, new_user: false });
                                        addElizaServices(); //add services
                                    }
                                    else socket.emit("sign_on_result", { success: false, reason: "The user '" + data.username + "' exists already and their password does not match yours." });
                                }
                                else {
                                    //user not exist. add to table.
                                    if (data.gender.match(genderRegex)) {
                                        let conn = createConnection();
                                        conn.connect(function (err) {
                                            if (err) console.log(err);
                                            else {
                                                let d = new Date();
                                                sql = `INSERT INTO ElizaAcquaintance(username, password, gender, meeting_date) VALUES (
                                                ${mysql.escape(data.username)},
                                                ${mysql.escape(data.password)},
                                                ${mysql.escape(data.gender)},
                                                '${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}'
                                               );`
                                                conn.query(sql, function (err) {
                                                    if (err) throw sql + err;
                                                    else {
                                                        console.log("ElizaAcquaintance entry added for '" + data.username + "'");
                                                        socket.emit("sign_on_result", { success: true, new_user: true });
                                                        addElizaServices() //add services
                                                    }
                                                    conn.end();
                                                });
                                            }
                                        });
                                    } else socket.emit("sign_on_result", { success: false, reason: "Invalid gender. Provide one of \"\", \"m\", \"f\"" });
                                }
                                function addElizaServices() {
                                    //sign-on successful. enable services.

                                    //enable factbase querying service.


                                    socket.on("query_factbase", function (data) {

                                        let query = data.query;
                                        if (query.length >= min_term_size) {
                                            if (query.length <= max_term_size) {
                                                //query validated. query table.
                                                let conn = createConnection();
                                                console.log("query db for: '" + data.query + "'")
                                                conn.connect(function (err) {
                                                    if (err) throw err;
                                                    else {
                                                        //connection successful. query factbase.
                                                        let sql = `
                                                        SELECT fact_id, fact_date, negotiator, gender, term1, operator, term2, 'fact' as 'type'
                                                        FROM ElizaMemory inner join ElizaAcquaintance
                                                        ON ElizaMemory.negotiator = ElizaAcquaintance.username
                                                        WHERE term1 LIKE ${mysql.escape(query)} OR term2 LIKE ${mysql.escape("%" + query)}
                                                        LIMIT ${QUERY_MAXROWS};
                                                        `;
                                                        conn.query(sql, function (err, results) {
                                                            if (err) console.log(err)
                                                            else {
                                                                console.log(query, results);
                                                                let formatted_results = [];

                                                                for (result of results) {
                                                                    if (result.type === 'fact') {
                                                                        formatted_results.push({
                                                                            type: 'fact',
                                                                            fact: {
                                                                                fact_date: result.fact_date,
                                                                                fact_id: result.fact_id,
                                                                                term1: result.term1,
                                                                                operator: result.operator,
                                                                                term2: result.term2,
                                                                                negotiator: {
                                                                                    username: result.negotiator,
                                                                                    gender: result.gender
                                                                                }
                                                                            }

                                                                        });
                                                                    }


                                                                }
                                                                socket.emit("query_result", { success: true, results: formatted_results });
                                                                conn.end();
                                                            }
                                                        })
                                                    }
                                                });

                                            } else socket.emit("query_result", { success: false, reason: "Query must be at most " + max_term_size + " character(s) long." });
                                        } else socket.emit("query_result", { success: false, reason: "Query must be at least " + min_term_size + " character(s) long." });

                                    });
                                    //enable new fact creation service.
                                    socket.on("new_fact", function (data) {
                                        //validate fact.
                                        if (validateFact(data.fact)) {
                                            let fact = data.fact;


                                            let conn = createConnection();
                                            conn.connect(function (err) {
                                                if (err) console.log(err);
                                                else {
                                                    let d = new Date();
                                                    sql = `INSERT INTO ElizaMemory(negotiator, fact_date, term1, operator, term2) VALUES (
                                                ${mysql.escape(fact.negotiator.username)},
                                                '${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}',
                                                ${mysql.escape(fact.term1)},
                                                ${mysql.escape(fact.operator)},
                                                ${mysql.escape(fact.term2)}
                                               );`
                                                    conn.query(sql, function (err) {
                                                        if (err) console.log(err.message)
                                                        else {
                                                            console.log("ElizaMemory entry added for '" + fact.term1 + " " + fact.operator + " " + fact.term2 + "' by user '" + fact.negotiator.username + "'.");
                                                        }
                                                    });
                                                }
                                                conn.end();
                                            });
                                        }



                                    });
                                    //enable conversation logging service.
                                    socket.on("conversation_log", function (data) {
                                        console.log("conversation log request received from user " + data.username)
                                        let log_str = "";

                                        let conn = createConnection();
                                        //construct serial string.
                                        for (log_entry of data.log) {
                                            let line = log_entry.text;
                                            //console.log("checking '" + line + "' : " + line.match(invalidMessageRegex));
                                            //validate line.
                                            if (line.match(invalidMessageRegex)) {
                                                socket.emit("log_received", { success: false, reason: "Log contains invalid characters." });
                                                return;
                                            }
                                            else {
                                                log_str += "[" + log_entry.agent + "]" + line + "//";
                                            }
                                        }


                                        if (data.username.match(usernameRegex)) {
                                            if (["eliza_new", "eliza_old"].findIndex(x => x === data.bot_type) >= 0) {
                                                conn.connect(function (err) {
                                                    if (err) throw err
                                                    else {
                                                        //connection successful. log request.
                                                        let d = new Date();
                                                        let sql = `INSERT INTO ElizaLog(conversation_date, username, log, bot_type, is_blind) VALUES (
                                                '${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}',
                                                ${mysql.escape(data.username)},
                                                ${mysql.escape(log_str)},
                                                ${mysql.escape(data.bot_type)},
                                                ${mysql.escape(data.blind)}
                                            )
                                            `;
                                                        conn.query(sql, function (err, result) {
                                                            if (err) {
                                                                console.log(sql + err);
                                                                socket.emit("log_received", { success: false, reason: "The server encountered a MySQL error: " + err });
                                                            }
                                                            else {
                                                                console.log("successfully logged to remote MySQL database.");
                                                                socket.emit("log_received", { success: true });

                                                                //enable evaluation service
                                                                var logId = result.insertId;
                                                                console.log(logId);
                                                                socket.on("user_evaluation", function (data) {
                                                                    if (data.results.q1 > 0 && data.results.q2 > 0 && data.results.q3 > 0 && data.results.q4 > 0) {
                                                                        let conn = createConnection();

                                                                        conn.connect(function (err) {
                                                                            if (err) throw err
                                                                            else {
                                                                                //connection successful. log result.
                                                                                let d = new Date();
                                                                                let sql = `INSERT INTO ElizaResult(conversation_id, result_date, q1, q2, q3, q4, q5, notes) VALUES (
                                                                                            ${mysql.escape(logId)},
                                                                                            '${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}',
                                                                                            ${mysql.escape(data.results.q1)},
                                                                                            ${mysql.escape(data.results.q2)},
                                                                                            ${mysql.escape(data.results.q3)},
                                                                                            ${mysql.escape(data.results.q4)},
                                                                                            ${mysql.escape(data.results.q5)},
                                                                                            ${mysql.escape(data.results.notes)}
                                                                                        );
                                                                                        `;
                                                                                conn.query(sql, function (err) {
                                                                                    if (err) {
                                                                                        console.log(sql + err);
                                                                                        socket.emit("evaluation_received", { success: false, reason: "The server encountered a MySQL error: " + err });
                                                                                    }
                                                                                    else {
                                                                                        console.log("evaluation logged successfully to remote MySQL database.");
                                                                                        socket.emit("evaluation_received", { success: true });
                                                                                    }
                                                                                });
                                                                            }
                                                                            conn.end();
                                                                        });
                                                                    }
                                                                    else socket.emit("evaluation_received", { success: false, reason: "Please enter a result for all of the primary questions." });
                                                                });
                                                            }
                                                        });
                                                    }
                                                    conn.end();
                                                });
                                            } else socket.emit("log_received", { success: false, reason: "The given bot_type is invalid." })


                                        } else socket.emit("log_received", { success: false, reason: "The given username failed server-side validation." });
                                    });


                                }
                            }
                            else console.log("SELECT query returned no data.");
                        });
                    }
                    conn.end();
                });

            } else socket.emit("sign_on_result", { success: false, reason: "Invalid password. Use only alphanumeric characters." });
        } else socket.emit("sign_on_result", { success: false, reason: "Invalid username." });


    });
});
