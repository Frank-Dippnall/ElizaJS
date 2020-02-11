/*
 * Francis Dippnall (17003003)
 * Eliza implementation in JavaScript. 
 * Based off of original Pascal code and using modified definition file.
 * 
 * New version with long-term memory.
 */

class ElizaBotNew {
    constructor(options, methods) {
        this.options = options;
        this.bot_type = "eliza_new";
        this._active_context = null;
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
            username: string
        }
        */
        this._methods = methods; // use given exposed methods. 
        /* methods for new version.
        * methods : {
            log_conversation: function(username:string, log:string[], bot_type:string),
            query_factbase: function(query:string, callback:function(result))
        }
        */
        this.ready = false;
        this.last_message = "";
        //declare names.
        this.names = {
            male: [],
            female: [],
            unspecified: []
        }
        let eliza = this;
        var xmlhttp_definition = new XMLHttpRequest();
        xmlhttp_definition.open('GET', 'js/eliza/new/definition.net');
        xmlhttp_definition.onreadystatechange = function () {
            if (xmlhttp_definition.status == 200 && xmlhttp_definition.readyState == 4) {
                eliza.definitions = eliza._parse_definitions(xmlhttp_definition.responseText.toUpperCase());
                eliza.log = [];
                eliza.output_html = "";
                eliza.message = "";
                //send signon message
                eliza._output(eliza._run_macros(eliza._get_sign_on_message()), 'bot', true);
            }
        }
        //retreive and parse the name data.
        xmlhttp_definition.send();
        var xmlhttp_male = new XMLHttpRequest();
        xmlhttp_male.open('GET', 'js/eliza/new/names/male.net');
        xmlhttp_male.onreadystatechange = function () {
            if (xmlhttp_male.status == 200 && xmlhttp_male.readyState == 4) {
                let tempNames = xmlhttp_male.responseText.toUpperCase().split("\n");
                eliza.names.male = [];
                for (name of tempNames) {
                    eliza.names.male.push(name.trim());
                }
                console.log("'male' nameset complete.")
            }
        }
        xmlhttp_male.send();
        var xmlhttp_female = new XMLHttpRequest();
        xmlhttp_female.open('GET', 'js/eliza/new/names/female.net');
        xmlhttp_female.onreadystatechange = function () {
            if (xmlhttp_female.status == 200 && xmlhttp_female.readyState == 4) {
                let tempNames = xmlhttp_female.responseText.toUpperCase().split("\n");
                eliza.names.female = [];
                for (name of tempNames) {
                    eliza.names.female.push(name.trim());
                }
                console.log("'female' nameset complete.")
            }
        }
        xmlhttp_female.send();
        var xmlhttp_unspecified = new XMLHttpRequest();
        xmlhttp_unspecified.open('GET', 'js/eliza/new/names/unknown.net');
        xmlhttp_unspecified.onreadystatechange = function () {
            if (xmlhttp_unspecified.status == 200 && xmlhttp_unspecified.readyState == 4) {
                let tempNames = xmlhttp_unspecified.responseText.toUpperCase().split("\n");
                eliza.names.unspecified = [];
                for (name of tempNames) {
                    eliza.names.unspecified.push(name.trim());
                }
                console.log("'unspecified' nameset complete.")
            }
        }
        xmlhttp_unspecified.send();

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
                console.log("attempting to output: ", response)
                response = this._run_macros(response);
                this._output(response, 'bot');
            }
        } else console.log("wait until I'm ready!");
    }

    _get_sign_on_message() {
        if (this.options.new_user) return Array.getRandom(this.definitions.sign_on.new_user);
        else return Array.getRandom(this.definitions.sign_on.known_user);
    }

    _parse_message(message) {
        //this function is responsible for getting the response from Eliza. Main difference between versions.
        //format message. uppercase + remove all punctuation.
        message = message.toUpperCase();
        //flag determines is the string is a valid Lexical Term.


        if (message.length == 0) {
            return Array.getRandom(this.definitions.null_entry);
        }
        else {
            //PRIORITY 1 - fact extraction.
            //FACT EXTRACTION - see design documentation for more info.
            //message contains characters. search for operators in descending priority order.
            fact_extraction:
            for (let op of this.definitions.operators) {
                let pos = message.search(op);

                if (pos >= 0) {
                    //op found. split string.
                    console.log("highest priority operator found:\n", op, "found at position ", pos);
                    //get lexical terms
                    let term1 = message.substr(0, pos);
                    let term2 = message.substr(pos + op.length);
                    //trim term1
                    term1 = term1.split(/[.,;:!?]/g);
                    term1 = term1[term1.length - 1].trim(); //get last section.
                    //trim word boundaries

                    //trim term2
                    term2 = term2.split(/[.,;:!?]/g);
                    term2 = term2[0].trim(); //get first section.

                    console.log("candidate fact extracted: " + term1 + "|" + op + "|" + term2);


                    //TODO complete.

                    //check for contextual pronouns.

                    let undefined_pronouns = []; //if this array has members after this for loop, abort.
                    for (let pronoun_class of this.definitions.pronoun_classes) {
                        if (pronoun_class.person === "THIRD-PERSON") {
                            //third-person pronoun. requires context.
                            for (let pronoun of pronoun_class.pronouns) {
                                let pronoun_pos;
                                let pronounRegexStr = "\\b(" + pronoun + ")\\b";
                                let pronounRegex = new RegExp(pronounRegexStr);
                                //check term1 for pronouns
                                pronoun_pos = term1.search(pronounRegex);
                                if (pronoun_pos >= 0) {
                                    //pronoun found in term.
                                    if (this.active_context) {
                                        //a context exists. check if class matches.
                                        if (this._context_match(pronoun_class)) {
                                            console.log("replacing ", pronoun, " with ", this.active_context.noun)
                                            //pronoun class matches. replace with ACN
                                            term1 = term1.replace(pronoun, this.active_context.noun);
                                            let temp_index = undefined_pronouns.findIndex(p => p === ("term1: " + pronoun));
                                            if (temp_index >= 0) undefined_pronouns.splice(temp_index);
                                        }
                                        else undefined_pronouns.push("term1: " + pronoun)
                                    }
                                    else {
                                        //no context exists. abort immediately
                                        break fact_extraction;
                                    }
                                }
                                //check term2 for pronouns
                                pronoun_pos = term2.search(pronounRegex);
                                if (pronoun_pos >= 0) {
                                    //pronoun found in term.
                                    if (this.active_context) {
                                        //a context exists. check if class matches.
                                        if (this._context_match(pronoun_class)) {
                                            console.log("replacing ", pronoun, " with ", this.active_context.noun)
                                            //pronoun class matches. replace with ACN
                                            term2 = term2.replace(pronoun, this.active_context.noun);
                                            let temp_index = undefined_pronouns.findIndex(p => p === ("term2: " + pronoun));
                                            if (temp_index >= 0) undefined_pronouns.splice(temp_index);
                                        }
                                        else undefined_pronouns.push("term2: " + pronoun)
                                    }
                                    else {
                                        //no context exists. abort immediately
                                        break fact_extraction;
                                    }
                                }
                            }
                        }
                    }

                    //check for undefined pronouns and abort if any are found.
                    if (undefined_pronouns.length > 0) {
                        console.log("undefined pronouns detected: ", undefined_pronouns);
                        break fact_extraction;
                    }
                    //context has been applied. 
                    //reaching this point means that the fact extraction is confirmed.
                    console.log("fact confirmed: " + term1 + "|" + op + "|" + term2);

                    //TODO continue.



                    return this._transpose(term1) + " " + op + " " + this._transpose(term2) + ". Got it.";

                    break; //do not continue searching since higher priority op found.
                }
            }
            //PRIORITY 2 - catch chatter (greeting etc). "fallback keywords"
            //no facts found. check for fallback keywords.
            for (let fallback of this.definitions.fallback_keywords) {
                for (let keyword of fallback.keywords) {
                    let pos = message.search(new RegExp("\\b" + keyword + "\\b"));
                    if (pos >= 0) {
                        //keyword found. respond.
                        return Array.getRandom(fallback.responses);
                    }
                }

            }
            //PRIORITY 3 - detect single term statements.
            //check if message is a valid term.
            if (this._is_valid_term(message)) {
                //valid term found. set current context.
                console.log("string is valid lexical term: ", message);
                this._update_active_context({
                    noun: message,
                    pronoun_class: this._estimate_pronoun_class(message)
                });
                return Array.getRandom(this.definitions.non_fact);
            }
            else {
                //message is neither fact nor noun. wut
                return Array.getRandom(this.definitions.non_noun);
            }


        }

        return "UNIMPLEMENTED";
    }
    _context_match(pronoun_class) {
        //returns true if the given pronoun class matches the current context pronoun class.
        return (
            this.active_context.pronoun_class.person === pronoun_class.person &&
            this.active_context.pronoun_class.plurality === pronoun_class.plurality &&
            this.active_context.pronoun_class.gender === pronoun_class.gender
        );
    }
    _update_active_context(context) {
        this._active_context = context;
        console.log("changed active context to ", context)
    }
    get active_context() {
        return this._active_context;
    }
    _estimate_pronoun_class(term) {
        //returns an estimated pronoun class for the lexical term.
        //TODO improve accuracy of estimation. 
        let pronoun_class = {
            person: "THIRD-PERSON",
            plurality: "SINGULAR",
            gender: "GENDERLESS",
        }

        //plurality rule: ends in 's'
        if (term[term.length - 1].toLowerCase() === 's') pronoun_class.plurality = "PLURAL";
        //gender rule: search for names.

        let words = term.split(" ");

        for (let word of words) {

            if (Array.binarySearchBoolean(word, this.names.male)) {
                //male name found.
                pronoun_class.gender = "MALE";
            }
            else if (Array.binarySearchBoolean(word, this.names.female)) {
                pronoun_class.gender = "FEMALE";
            }
            else if (Array.binarySearchBoolean(word, this.names.unspecified)) {
                pronoun_class.gender = "UNSPECIFIED";
            }
        }

        return pronoun_class;

    }
    _is_valid_term(string) {
        //returns true if the given string is a valid lexical term assuming no context.
        //punctuation is not valid.
        if (string.match(/[.,!?:;()]/)) {
            return false;
        }

        //term boundaries are not valid.
        let boundaryRegex = new RegExp(this._term_boundary_regex());
        if (string.match(boundaryRegex)) {
            return false;
        }

        let words = string.split(" ");
        //third-person pronouns are not valid.
        for (let pronoun_class of this.definitions.pronoun_classes) {
            if (pronoun_class.person === "THIRD-PERSON") {
                for (let pronoun of pronoun_class.pronouns) {
                    if (words.findIndex(w => w === pronoun) >= 0) {
                        return false;
                    }
                }
            }
        }
        return true; //validation complete.
    }
    _run_macros(line) {
        //replaces special commands with their macro value.
        let new_line = line
            .replace("\\USERNAME", this.options.username)
            .replace("\\MESSAGE", this.last_message)

        return this._case(new_line);
    }
    _case(line) {
        function getLastNonSpaceChar(string, position) {
            for (let c = position - 1; c >= 0; c--) {
                if (string[c] !== " ") return string[c];
            }
        }
        line = line.toLowerCase().trim();
        let new_line = "";
        for (let c in line) {
            let char = line[c];
            if (char.match(/[a-z]/)) {
                //first letter of sentence is capitalised.
                if (c == 0 || getLastNonSpaceChar(line, c).match(/[.!?]/)) {
                    char = char.toUpperCase();
                }
            }
            new_line += char;
        }
        //capitalise special words.
        new_line = new_line
            .replace(" i ", " I ")
            .replace(" i'm ", " I'm ")
            .replace(" eliza", " Eliza")

        return new_line;
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
    _term_boundary_regex() {
        let regex = "";
        for (let boundary of this.definitions.term_boundaries) {
            regex += "(" + boundary + ")|"
        }
        return "\\b" + regex.substr(0, regex.length - 1) + "\\b";
    }
    _parse_definitions(definition_text) {

        console.log("to parse: ", definition_text)
        const contexts = {
            NONE: 'none',
            TRANSPOSE: 'transpose',
            KEYWORD: 'keyword',
            KEYWORD_RESPONSE: 'keyword_response'
        };

        var definitions = {
            sign_on: {
                new_user: [],
                known_user: [],
            },
            transpose: {},
            null_entry: [],
            non_noun: [],
            non_fact: [],
            operators: [],
            term_boundaries: [],
            pronoun_classes: [],
            fallback_keywords: [],

        }

        var definition_lines = definition_text.split("\n");
        //initialise context
        var current_transpose = null;
        var current_pronoun_index = null;
        //fallback variables.
        var current_fallback_index = null;
        var current_fallback_keyword = null;
        for (let line of definition_lines) {
            let command = line[0] + line[1]; //two letter opcode as of new version.
            let text = line.substr(2).trim().toUpperCase();
            switch (command) {
                case 'S0':
                    //sign on message definition
                    definitions.sign_on.new_user.push(text);
                    break;
                case 'S1':
                    definitions.sign_on.known_user.push(text);
                    break;
                case 'TR':
                    //transpose - pair of words with same meaning.
                    if (current_transpose) {
                        //second word received - add to list.
                        definitions.transpose[current_transpose] = text.substr(0, text.length - 1).trim();
                        current_transpose = null; //reset context
                    } else {
                        current_transpose = text.substr(0, text.length - 1).trim();
                    }
                    break;
                case 'NL':
                    //null entry
                    definitions.null_entry.push(text);
                    break;
                case 'NN':
                    //non noun message.
                    definitions.non_noun.push(text);
                    break;
                case 'NF':
                    //non fact message.
                    definitions.non_fact.push(text);
                    break;
                case 'OP':
                    //operator.
                    definitions.operators.push(text);
                    break;
                case 'PC':
                    //pronoun class.
                    //create pronoun class.
                    let pronoun_class = text.split(";")[0].trim().split(" ");
                    current_pronoun_index = definitions.pronoun_classes.length;
                    definitions.pronoun_classes.push({ person: pronoun_class[0], plurality: pronoun_class[1], gender: pronoun_class[2], pronouns: [] });
                    break;
                case 'PR':
                    //pronoun inside PC
                    definitions.pronoun_classes[current_pronoun_index].pronouns.push(text);
                    break;
                case 'TB':
                    //term boundary.
                    definitions.term_boundaries.push(text);
                    break;
                case 'KE':
                    //get index of current fallback keywords
                    current_fallback_index = definitions.fallback_keywords.findIndex(f => f.keywords.findIndex(k => k === current_fallback_keyword) >= 0);
                    //fallback keyword
                    current_fallback_keyword = text;
                    //does fallback already exist?
                    if (current_fallback_index >= 0) {
                        //add keyword to current keyword.
                        definitions.fallback_keywords[current_fallback_index].keywords.push(current_fallback_keyword);
                    }
                    else {
                        //create keyword list member.
                        current_fallback_index = definitions.fallback_keywords.length;
                        definitions.fallback_keywords.push({ keywords: [current_fallback_keyword], responses: [] });
                    }
                    break;
                case 'RE':
                    //add response to fallback keyword responses.
                    definitions.fallback_keywords[current_fallback_index].responses.push(text);
                    break;
                default:
                    current_pronoun_index = null;
                    current_fallback_index = null;
                    current_transpose = null;
                    break;
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
