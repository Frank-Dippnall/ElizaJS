const express = require('express');
const mysql = require('mysql');
const http = require("http");
const app = express();
const server = http.createServer(app);
const io = require("socket.io")(server);

const usernameRegex = /^[a-zA-Z0-9]{1,31}$/;
const passwordRegex = /^[a-zA-Z0-9]{4,63}$/;
const genderRegex = /^[mf]?$/;
const invalidMessageRegex = /[/"`\n\\]/g;

//changed to localhost. 
var DB_HOST = "localhost"
var DB_PORT = 3306 //6306
var DB_USER = "root";
var DB_DATABASE = "dippnalf";
var DB_PASS = null;

function attemptSetDBPass(new_db_pass) {
    //check pass is valid.
    console.log("Attempting to set DB_PASS to " + new_db_pass);
    let conn = mysql.createConnection({
        host: DB_HOST,
        user: DB_USER,
        password: new_db_pass,
        port: DB_PORT,
        database: DB_DATABASE
    });
    conn.connect(function (err) {
        if (err) {
            console.log("DB_PASS not set: " + err);
        }
        else {
            DB_PASS = new_db_pass;
            console.log("DB_PASS set.");
        }
        conn.end();
    });
}

app.use(express.static("public"));
app.get("/set_db_pass", function (req, res) {
    if (DB_PASS) {
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
        host: DB_HOST,
        user: DB_USER,
        password: DB_PASS, //TODO REMOVE
        port: DB_PORT,
        database: DB_DATABASE
    });
}

server.listen(8030, function () {
    console.log("App running on localhost:8030");
});

io.on("connection", function (socket) {
    socket.on("sign_on", function (data) {
        console.log("sign on request received for username: '" + data.username + "'");
        let valid_sign_on = false;
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
                                                });
                                            }
                                            conn.end();
                                        });
                                    } else socket.emit("sign_on_result", { success: false, reason: "Invalid gender. Provide one of \"\", \"m\", \"f\"" });
                                }
                                function addElizaServices() {
                                    //sign-on successful. enable logging + query service.
                                    socket.on("conversation_log", function (data) {
                                        console.log("conversation log request received. ")
                                        let log_str = "";
                                        let conn = createConnection();
                                        //construct serial string.
                                        for (line of data.log) {
                                            //console.log("checking '" + line + "' : " + line.match(invalidMessageRegex));
                                            //validate line.
                                            if (line.match(invalidMessageRegex)) {
                                                socket.emit("log_received", { success: false, reason: "Log contains invalid characters." });
                                                return;
                                            }
                                            else {
                                                log_str += line + "//";
                                            }
                                        }


                                        if (data.username.match(usernameRegex)) {
                                            console.log(data.bot_type);
                                            if (["eliza_new", "eliza_old"].findIndex(x => x === data.bot_type) >= 0) {
                                                conn.connect(function (err) {
                                                    if (err) throw err
                                                    else {
                                                        //connection successful. log request.
                                                        let d = new Date();
                                                        let sql = `INSERT INTO ElizaLog(conversation_date, username, log) VALUES (
                                                '${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}',
                                                ${mysql.escape(data.username)},
                                                ${mysql.escape(log_str)}
                                            )
                                            `;
                                                        conn.query(sql, function (err) {
                                                            if (err) {
                                                                console.log(sql + err);
                                                                socket.emit("log_received", { success: false, reason: "The server encountered a MySQL error: " + err });
                                                            }
                                                            else {
                                                                console.log("successfully logged to remote MySQL database.");
                                                                socket.emit("log_received", { success: true });
                                                            }
                                                        });
                                                    }
                                                    conn.end();
                                                });
                                            } else socket.emit("log_received", { success: false, reason: "The given bot_type is invalid." })


                                        } else socket.emit("log_received", { success: false, reason: "The given username failed server-side validation." });
                                    });
                                    //enable factbase querying service.
                                    socket.on("query_factbase", function (data) {
                                        console.log("Query: " + data.query)
                                        let query = data.query;
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
