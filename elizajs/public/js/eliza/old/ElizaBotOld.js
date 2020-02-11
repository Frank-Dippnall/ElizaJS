/*
 * Francis Dippnall (17003003)
 * Eliza implementation in JavaScript. 
 * Based off of original Pascal code and using original definition file.
 * 
 * Old version with no long-term memory.
 */

class ElizaBotOld {
    constructor(options, methods) {
        this.options = options;
        this.bot_type = "eliza_old";
        /*
        * options : {
            output: DOMElement,
            container: DOMElement,
            wait_time: {
                bot: integer,
                user: integer,
                response: integer
            },
            new_user: boolean
        
        }
        */
        this._methods = methods; // use given exposed methods. 
        /*
        * methods : {
            log_conversation: function(username:string, log:string[])
        }
        */
        //get definitions
        var xml_http = new XMLHttpRequest();
        this.ready = false;
        this.last_message = "";
        let eliza = this;
        xml_http.open('GET', 'js/eliza/old/definition.net');
        xml_http.onreadystatechange = function () {
            if (xml_http.status == 200 && xml_http.readyState == 4) {
                eliza.definitions = eliza._parse_definitions(xml_http.responseText.toUpperCase());
                eliza.log = [];
                eliza.output_html = "";
                eliza.message = "";
                //send signon message
                eliza._output(Array.getRandom(eliza.definitions.sign_on), 'bot', true);
            }
        }
        xml_http.send();
    }
    async talk(message) {
        if (this.ready) {
            if (message.toLowerCase() === "!quit") {
                await this._output("!quit", 'user');
                await this._output("Goodbye " + this.options.username);
                if (this._methods.log_conversation) this._methods.log_conversation(this.options.username, this.log, this.bot_type);
            }
            else {
                this.last_message = message;
                await this._output(message, 'user');

                //get response from eliza
                let response = this._parse_message(message);
                this._output(response, 'bot');
            }
        } else console.log("wait until I'm ready!");
    }

    _parse_message(message) {
        //this function is responsible for getting the response from Eliza.
        //format message. uppercase + remove all punctuation.
        message = message.toUpperCase().replace(/[?.,!@~;:]/g, "");
        //parse message from user agent.
        if (message.length === 0) {
            //null response
            return Array.getRandom(this.definitions.null_entry);
        }
        else {
            let keywords = this.definitions.keywords;
            //search for keywords.
            for (let keyword_class of keywords) {
                //for each keyword in this class:
                for (let keyword of keyword_class.keywords) {
                    //check if message contains keyword.
                    let index = message.search(keyword);
                    if (index >= 0) {
                        //check word is a "word" sperated by string start/end/space.
                        if ((index === 0 || message[index - 1] === " ") && (index + keyword.length === message.length || message[index + keyword.length] === " ")) {
                            //keyword found - get post-keyword statement.
                            let post_keyword_text = message.substr(index + keyword.length).trim();
                            //transpose text.
                            post_keyword_text = this._transpose(post_keyword_text);
                            //construct response with * replaced.
                            return Array.getRandom(keyword_class.responses).replace("*", " " + post_keyword_text);
                        }
                    }
                }
            }
            //no keyword found.
            return Array.getRandom(this.definitions.no_keyword);
        }
    }

    _transpose(text) {
        //replaces words with transpositions found in table.
        let words = text.split(" ");
        let output_string = "";
        for (let word of words) {
            if (this.definitions.transpose[word]) {
                //transposition found. replace.
                word = this.definitions.transpose[word];
            }
            output_string += " " + word;
        }
        return output_string;
    }
    _parse_definitions(definition_text) {
        console.log(definition_text)
        const contexts = {
            NONE: 'none',
            TRANSPOSE: 'transpose',
            KEYWORD: 'keyword',
            KEYWORD_RESPONSE: 'keyword_response'
        };

        var definitions = {
            sign_on: [],
            transpose: {},
            null_entry: [],
            my: [],
            no_keyword: [],
            keywords: [],
        }

        var definition_lines = definition_text.split("\n");
        //initialise context
        var current_keywords = [];
        var current_responses = [];
        var current_transpose = null;
        for (let line of definition_lines) {
            let command = line[0];
            let text = line.substr(1).trim();
            switch (command) {
                case 'S':
                    //sign on message definition
                    definitions.sign_on.push(text);
                    break;
                case 'T':
                    //transpose - pair of words with same meaning.
                    if (current_transpose) {
                        //second word received - add to list.
                        definitions.transpose[current_transpose] = text.substr(0, text.length - 1).trim();
                        current_transpose = null; //reset context
                    } else {
                        current_transpose = text.substr(0, text.length - 1).trim();
                    }
                    break;
                case 'N':
                    //null entry
                    definitions.null_entry.push(text);
                    break;
                case 'M':
                    // UPDATE REQUIRED
                    break;
                case 'X':
                    //no keyword found
                    definitions.no_keyword.push(text);
                    break;
                case 'K':
                    //keyword list.
                    current_keywords.push(text.substr(0, text.length - 1).trim());
                    break;
                case 'R':
                    //response - end of keyword list.
                    current_responses.push(text);
                    break;
                default:
                    if (current_keywords.length > 0 && current_responses.length > 0) {
                        //add keyword response lists to response map.
                        definitions.keywords.push({
                            keywords: current_keywords,
                            responses: current_responses
                        });
                    }
                    // ; character or unrecognised command - reset context
                    current_transpose = null;
                    current_keywords = [];
                    current_responses = [];

            }
        }
        console.log(definitions)
        return definitions;
    }
    _fast_output(newmessage, agent = 'bot') {
        this.output_html = this._construct_html(newmessage, agent);
        this.options.output.innerHTML = this.output_html;
    }
    async _output(text, agent = 'bot', nowait = false) {
        if (agent === 'bot' && !nowait) {
            this.ready = false;
            await sleep(this.options.wait_time.response);
        }
        if (text.length > 0 && ((agent === 'bot' && this.options.wait_time.bot > 0) || (agent === 'user' && this.options.wait_time.user > 0))) {
            this.message = "";
            this.log.push(text);
            for (let char of text) {
                this._add_char(char, agent)
                this._update_container();
                if (agent === 'bot') await sleep(this.options.wait_time.bot);
                else await sleep(this.options.wait_time.user)

            }
            this.output_html = this._construct_html(text, agent);
            this.ready = true;
        }
        else {
            this._fast_output(text, agent);
            this.ready = true;
            this._update_container();
        }

    }
    _update_container() {
        this.options.container.scrollTop = this.options.container.scrollHeight;
    }

    _construct_html(message, agent = 'bot') {
        if (agent && agent === 'bot') return this.output_html +
            "<div class='eliza_response'><span style='color:red'>ELIZA: </span>" + message + "</div>";
        else return this.output_html +
            "<div class='user_response'><span style='color:blue'>" + this.options.username + ": </span>" + message + "</div>";
    }

    _add_char(char, agent) {
        this.message += char;
        this.options.output.innerHTML = this._construct_html(this.message, agent);
    }
}
