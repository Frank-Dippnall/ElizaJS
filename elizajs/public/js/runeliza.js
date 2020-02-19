/**
 * Francis Dippnall (17003003)
 * runeliza.js - client-side script that runs the a random ElizaBot version and 
 * interacts with the server via socket.io.
 * 
 */

let href = window.location.href.split("?")[0];
var socket = io(href);

var currentElizaInstance = null;

//makes text output fast.
const DEBUG_MODE = false;


function flipCoin() {
    let x = Math.floor(Math.random() * Math.floor(2));
    return x < 1 ? "heads" : "tails";
}

var blind;
function loadEliza(options, methods, callback) {
    //select bot type randomly
    let typeElement = document.getElementById("bot_type");
    let type = typeElement.value;

    //randomize for random type.
    if (type === "random") {
        blind = true;
        type = flipCoin() === "heads" ? "eliza_new" : "eliza_old";
    }
    else blind = false;

    let bot_type = "undefined";
    if (type === "eliza_new") bot_type = "new";
    else if (type === "eliza_old") bot_type = "old";


    let eliza_element = document.getElementById("bot");
    let eliza = ElizaBot.createInstance(bot_type, {
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
                if (!message.match(invalidCharacterRegex)) {
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
    console.log("Eliza Core \"" + eliza.bot_type + "\" loaded.");

}






document.addEventListener("DOMContentLoaded", function () {
    if (DEBUG_MODE) {
        document.getElementById("username").value = "test";
        document.getElementById("eliza_slow").checked = false;
        document.getElementById("user_slow").checked = false;
        document.getElementById("username").focus();
    }
    let type_descriptions = {
        "random": "A bot type will be selected randomly. Good for blind testing.",
        "eliza_new": "The new ElizaJS core, with built in long term memory and other features.",
        "eliza_old": "A JS remake of the original Eliza using the original definition file."
    }

    let bot_type_elem = document.getElementById("bot_type");
    let type_description_elem = document.getElementById("type_info");
    bot_type_elem.addEventListener("change", function () {
        type_description_elem.innerHTML = type_descriptions[bot_type_elem.value]
    })

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
        if (username.match(/^[a-zA-Z0-9]{1,31}$/) && password ? password.match(/^[a-zA-Z0-9]{3,63}$/) : true) {

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
                        log_conversation: function (username, log) {
                            //REQUIRED: conversation log function. called when the user /quit
                            loading_elem.innerHTML = "Logging conversation...";
                            let bot_type = currentElizaInstance.bot_type;
                            console.log("log data sent to server:", { username, log, bot_type, blind })
                            socket.emit("conversation_log", { username, log, bot_type, blind });
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
                                if (response.success) {
                                    console.log("query response: ", response)
                                    //format results
                                    let formatted_results = [];
                                    for (result of response.results) {
                                        formatted_results.push(result);
                                    }
                                    callback(formatted_results)
                                }
                                else {
                                    callback([]);
                                }

                            });
                        },
                        send_new_fact: function (fact) {

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
                    });
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

    //evaluation form
    let results_form = document.getElementById("evaluation_form");
    results_form.addEventListener("submit", function (e) {
        function likert(string) {
            switch (string.toLowerCase()) {
                case "strong_agree": return 5;
                case "agree": return 4;
                case "neutral": return 3;
                case "disagree": return 2;
                case "strong_disagree": return 1;
                default: return 0;
            }
        }
        function getRadioValue(name) {
            var inputs = document.getElementsByName(name);
            for (let input of inputs) {
                if (input.checked) {
                    console.log("returning " + input.value)
                    return input.value;
                }
            }
            return "";
        }
        e.preventDefault();
        console.log("submitting results...");
        let results = {
            q1: likert(getRadioValue("q1")),
            q2: likert(getRadioValue("q2")),
            q3: likert(getRadioValue("q3")),
            q4: likert(getRadioValue("q4")),
            q5: likert(getRadioValue("q5")),

            notes: document.getElementById("notes").value
        };

        let evaluation_message = document.getElementById("evaluation_msg");
        evaluation_message.innerHTML = "Sending results to server...";
        socket.emit("user_evaluation", { results });
        socket.on("evaluation_received", function (response) {
            if (response.success) {
                evaluation_message.innerHTML = "The results have been logged. Thanks for the feedback!";
                results_form.style.display = "none";
            }
            else {
                evaluation_message.innerHTML = "The server rejected the results data: " + response.reason;
            }
        })

    });

}, false);



