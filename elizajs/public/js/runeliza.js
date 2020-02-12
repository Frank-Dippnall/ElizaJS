/**
 * Francis Dippnall (17003003)
 * runeliza.js - client-side script that runs the a random ElizaBot version and 
 * interacts with the server via socket.io.
 * 
 */

let href = window.location.href.split("?")[0];
var socket = io(href);

var currentElizaInstance = null;

const FORCE_NEW = true; //for testing.
const DEBUG_MODE = false;

function flipCoin() {
    let x = Math.floor(Math.random() * Math.floor(2));
    return x < 1 ? "heads" : "tails";
}

function loadEliza(options, methods, callback, forceNew = false) {
    //select bot type randomly
    let type = "new";
    if (!forceNew) type = ((flipCoin() === "heads") ? "new" : "old");

    let eliza_element = document.getElementById("bot");
    let eliza = ElizaBot.createInstance(type, {
        output: document.getElementById("bot_output"),
        container: document.getElementById("bot_inner"),
        user: {
            username: options.username,
            gender: options.gender
        },
        wait_time: {
            bot: options.eliza_slow ? 30 : 0,
            user: options.user_slow ? 20 : 0,
            response: 500
        },
        new_user: options.new_user //is the user a new user or has Eliza spoken before.
    }, methods);

    let input_box = document.getElementById("bot_input");
    //give focus to message box
    input_box.focus();
    //add event handler
    input_box.addEventListener("keyup", function (event) {
        switch (event.keyCode) {
            case 13:
                event.preventDefault();
                //validate message.
                let message = input_box.value;
                if (!message.match(/[/"`\n\\]/g)) {
                    //client side validation.
                    eliza.talk(input_box.value);
                }
                else alert("One or more invalid characters in message.");
                input_box.value = "";
                break;
            case 38:
                event.preventDefault();
                input_box.value = eliza.last_message;
                break;
        }
    });
    function updateUI() {
        if (eliza.readyState === null) {
            //loading
            eliza_element.style.backgroundColor = "#aaaaaa";
            input_box.placeholder = "Loading";
        }
        else {
            switch (eliza.readyState) {
                case 0:
                    //thinking/querying.
                    eliza_element.style.backgroundColor = "#ffdddd";
                    input_box.placeholder = "Eliza is thinking";
                    break;
                case 1:
                    //printing text to screen.
                    eliza_element.style.backgroundColor = "#fff2d4";
                    input_box.placeholder = "Please wait";
                    break;
                case 2:
                    //ready.
                    eliza_element.style.backgroundColor = "#ddffdd";
                    input_box.placeholder = "Enter message and press enter";
                    break;

            }
        }

    }
    setInterval(updateUI, 10);
    callback(eliza);
}






document.addEventListener("DOMContentLoaded", function () {
    if (DEBUG_MODE) {
        document.getElementById("username").value = "test";
        document.getElementById("eliza_slow").checked = false;
        document.getElementById("user_slow").checked = false;
        document.getElementById("username").focus();
    }
    let eliza_elem = document.getElementById("bot");
    eliza_elem.style.display = "none";
    let results_wrapper = document.getElementById("results_wrapper");
    results_wrapper.style.display = "none";

    let user_form = document.getElementById("user_form");
    let loading_elem = document.getElementById("content_loading");
    user_form.addEventListener("submit", function (e) {
        e.preventDefault();


        loading_elem.innerHTML = "Validating data...";

        let username = document.getElementById("username").value;
        let password = document.getElementById("password").value;
        let gender = document.getElementById("gender").value;
        let eliza_slow = document.getElementById("eliza_slow").checked;
        let user_slow = document.getElementById("user_slow").checked;

        //client-side validation
        if (username.match(/^[a-zA-Z0-9]{1,31}$/) && password ? password.match(/^[a-zA-Z0-9]{4,63}$/) : true) {

            loading_elem.innerHTML = "Signing on to ElizaJS...";
            socket.emit("sign_on", {
                username,
                password,
                gender
            });
            socket.on("sign_on_result", function (response) {
                if (response.success) {
                    loading_elem.innerHTML = "Loading Eliza...";
                    //connection established. send user data.
                    loadEliza({
                        username,
                        gender, //user's gender
                        eliza_slow,
                        user_slow,
                        new_user: response.new_user
                    }, {
                        log_conversation: function (username, log, bot_type) {
                            //REQUIRED: conversation log function. called when the user /quit
                            loading_elem.innerHTML = "Logging conversation...";
                            console.log(username, log)
                            socket.emit("conversation_log", { username, log, bot_type });
                            socket.on("log_received", function (result) {
                                if (result.success) {
                                    loading_elem.innerHTML = "Conversation logged!";
                                    //go to thanks page.
                                    setTimeout(function () {
                                        results_wrapper.style.display = "block";
                                        eliza_elem.style.display = "none";
                                        loading_elem.innerHTML = "";
                                    }, 1500);

                                }
                                else {
                                    loading_elem.innerHTML = "Error while logging conversation: " + result.reason;
                                }

                            });
                        },
                        query_factbase: function (query, callback) {
                            console.log("query factbase for string: \"" + query + "\"");
                            socket.emit("query_factbase", { query });
                            socket.off("query_result"); //destroy old query_result listener.
                            socket.on("query_result", function (response) {
                                //format results
                                let formatted_results = [];
                                for (result of response.results) {
                                    let gender = result.negotiator.gender;
                                    switch (gender.toLowerCase()) {
                                        case "m": gender = "MALE"; break;
                                        case "f": gender = "FEMALE"; break;
                                        case "": gender = "UNSPECIFIED"; break;
                                    }
                                    result.negotiator.gender = gender;
                                    formatted_results.push(result);
                                }
                                callback(formatted_results)
                            });
                        },
                        send_new_fact: function (fact) {
                            //client-side validation TODO.

                            //sends the given fact to the server.
                            socket.emit("new_fact", { fact });
                            console.log("new fact sent to server: ", fact);
                        }
                    }, function (eliza) {
                        //eliza is loaded. hide form and loading_elem
                        user_form.style.display = "none";
                        loading_elem.innerHTML = "";
                        //display eliza UI
                        eliza_elem.style.display = "block";

                        currentElizaInstance = eliza;
                    }, FORCE_NEW);
                }
                else {
                    loading_elem.innerHTML = response.reason;
                }

            });
        }
        else {
            loading_elem.innerHTML = "User data failed client side validation.";
        }



    });

}, false);



