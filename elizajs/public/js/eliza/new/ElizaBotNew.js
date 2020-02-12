
/*
 * Francis Dippnall (17003003)
 * Eliza implementation in JavaScript. 
 * Based off of original Pascal code and using modified definition file.
 * 
 * New version with long-term memory.
 */

const punctuationRegex = /[.,:;/!?]/g;


class ElizaBotNew {
    get readyState() {
        return this._readyState;
    }
    set readyState(value) {
        //console.log("attempt to set ready state to ", value, typeof value)
        if (typeof value === "number") {
            this._readyState = value;
        }
        else this._readyState = null;
    }

    get methods() {
        return this._methods;
    }

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
            user: {
                username: string,
                gender: string
            } 
        }
        */
        this._methods = methods; // use given exposed methods. 
        /* methods for new version.
        * methods : {
            log_conversation: function(username:string, log:string[], bot_type:string),
            query_factbase: function(query:string, callback:function(result))
        }
        */
        this.readyState = null;
        this.last_message = "";
        //declare names.
        this.names = {
            male: [],
            female: [],
            unknown: []
        }
        let eliza = this; //expose eliza to callback
        var xmlhttp_definition = new XMLHttpRequest();
        xmlhttp_definition.open('GET', 'js/eliza/new/definition.net');
        xmlhttp_definition.onreadystatechange = function () {
            if (xmlhttp_definition.status == 200 && xmlhttp_definition.readyState == 4) {
                eliza.definitions = eliza._parse_definitions(xmlhttp_definition.responseText.toUpperCase());
                eliza.log = [];
                eliza.output_html = "";
                eliza.message = "";
                //send signon message
                eliza.readyState = 1;
                eliza._output(eliza._run_macros(eliza._get_sign_on_message()), 'bot', true, function () {
                    eliza.readyState = 2;
                });
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
                console.log("'male' nameset complete. ")
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
        var xmlhttp_unknown = new XMLHttpRequest();
        xmlhttp_unknown.open('GET', 'js/eliza/new/names/unknown.net');
        xmlhttp_unknown.onreadystatechange = function () {
            if (xmlhttp_unknown.status == 200 && xmlhttp_unknown.readyState == 4) {
                let tempNames = xmlhttp_unknown.responseText.toUpperCase().split("\n");
                eliza.names.unknown = [];
                for (name of tempNames) {
                    eliza.names.unknown.push(name.trim());
                }
                console.log("'unknown' nameset complete.")
            }
        }
        xmlhttp_unknown.send();

    }
    async talk(message) {
        if (this.readyState >= 2) {
            if (message.toLowerCase() === "!quit") {
                await this._output("!quit", 'user');
                await this._output("Goodbye " + this.options.user.username);
                this.readyState = null;
                if (this.methods.log_conversation) this.methods.log_conversation(this.options.user.username, this.log, this.bot_type);
            }
            else {

                this.last_message = message;
                this.readyState = 1;
                await this._output(message, 'user');
                //start timer
                this.last_message_time = new Date().getTime();
                //get response from eliza
                let eliza = this; //expose eliza to callback
                this.readyState = 0;
                this._get_response(message, function (response) {
                    eliza.readyState = 1;
                    response = eliza._run_macros(response);
                    console.log("eliza response took", (new Date().getTime() - eliza.last_message_time), "ms")
                    eliza._output(response, 'bot', false, function () {
                        eliza.readyState = 2;
                    });
                });
            }
        } else console.log("wait until I'm ready!");
    }

    _get_sign_on_message() {
        if (this.options.new_user) return Array.getRandom(this.definitions.sign_on.new_user);
        else return Array.getRandom(this.definitions.sign_on.known_user);
    }

    _get_response(message, callback) {
        //this function is responsible for getting the response from Eliza. its quite big
        //Main difference between versions.
        //format message
        message = this._format(message);

        if (message.length == 0) {
            callback(Array.getRandom(this.definitions.null_entry));
            return;
        }
        else {
            //PRIORITY 1 - catch explicit query requests.
            query_request:
            for (let query of this.definitions.query) {
                for (let keyword of query.keywords) {
                    let pos = message.search(new RegExp("\\b" + keyword + "\\b"));
                    if (pos >= 0) {
                        //keyword found. perform query.
                        console.log("explicit query request found: ", keyword)
                        let term = this._remove_punctuation(message.substr(pos + keyword.length)).trim();

                        //trim term.

                        console.log("term extracted: ", term);
                        //query factbase.
                        //respond immediately.
                        let eliza = this; //expose eliza to callback
                        this._output(this._case(Array.getRandom(query.responses)), "bot", false, function () {
                            eliza.methods.query_factbase(term, function (results) {
                                console.log("results of query: ", results)
                                //set current context.

                                if (results) {
                                    if (results.length > 0) {
                                        //select fact from list of known facts.
                                        let fact = Array.getRandom(results);
                                        //update context with fact from db
                                        eliza._update_active_context({
                                            noun: fact.term1,
                                            pronoun_class: eliza._estimate_pronoun_class(fact.term1),
                                            fact
                                        });

                                        callback(Array.getRandom(query.responses_yes));
                                    }
                                    else {
                                        //update context with provided query as noun.
                                        eliza._update_active_context({
                                            noun: term,
                                            pronoun_class: eliza._estimate_pronoun_class(term)
                                        });
                                        callback(Array.getRandom(query.responses_no));
                                    }
                                }
                                else {
                                    callback("I'm having trouble connecting to my memory database right now. Try again?")
                                }
                            });
                        }, this.options.wait_time.response); //query delay.
                        return; //stop execution after this code is run.
                    }
                }
            }
            //PRIORITY 2 - fact extraction.
            //FACT EXTRACTION - see design documentation for more info.
            //message contains characters. search for operators in descending priority order.
            console.log("begin fact extraction")
            fact_extraction:
            for (let op of this.definitions.operators) {
                let pos = message.search(new RegExp("\\b" + op + "\\b"));

                if (pos >= 0) {
                    //op found. split string.
                    console.log("highest priority operator found:\n", op, "found at position ", pos);

                    //get lexical terms
                    let term1 = this._trim_term1(message.substr(0, pos));
                    let term2 = this._trim_term2(message.substr(pos + op.length));
                    console.log("candidate fact extracted: " + term1 + "|" + op + "|" + term2);


                    //validate terms
                    if (term1.length > 0 && term2.length > 0) {
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
                    } else {
                        console.log("fact aborted - at least one term is empty.");
                        break fact_extraction;
                    }


                    //check if terms are valid
                    if (!(this._is_valid_term(term1) && this._is_valid_term(term2))) {
                        console.log("either term1 or term2 is invalid!")
                        break fact_extraction;
                    }

                    //context has been applied. 
                    //reaching this point means that the fact extraction is confirmed.
                    console.log("fact confirmed: " + term1 + "|" + op + "|" + term2);

                    //construct fact.
                    let fact = {
                        term1,
                        operator: op,
                        term2,
                        negotiator: {
                            username: this.options.user.username,
                            gender: this.options.user.gender
                        }
                    }

                    //update active context the SUBJECT is term1 assumedly.
                    this._update_active_context({
                        noun: term1,
                        pronoun_class: this._estimate_pronoun_class(term1),
                        fact
                    })

                    //callback.
                    callback(Array.getRandom(this.definitions.fact_responses))

                    //send new fact to factbase.
                    if (this.methods.send_new_fact) {
                        console.log("new fact sent to server: ", fact)
                        this.methods.send_new_fact(fact);
                    }


                    return;
                    //do not continue searching since higher priority op found.
                }
            }


            //PRIORITY 3 - catch chatter (greeting etc). "fallback keywords"
            //no facts found. check for fallback keywords.
            for (let fallback of this.definitions.fallback) {
                for (let keyword of fallback.keywords) {
                    let pos = message.search(new RegExp("\\b" + keyword + "\\b"));
                    if (pos >= 0) {
                        //keyword found. respond.
                        callback(Array.getRandom(fallback.responses));
                        return;
                    }
                }

            }
            //PRIORITY 4 - detect single term statements.
            //check if message is a valid term.
            if (this._is_valid_term(message)) {
                //valid term found. set current context.
                console.log("string is valid lexical term: ", message);
                this._update_active_context({
                    noun: message,
                    pronoun_class: this._estimate_pronoun_class(message)
                });
                callback(Array.getRandom(this.definitions.non_fact));
                return;
            }
            else {
                //message is neither fact nor noun. wut
                callback(Array.getRandom(this.definitions.non_noun));
                return;
            }
        }
    }
    _context_match(pronoun_class) {
        //returns true if the given pronoun class matches the current context pronoun class.
        //also handles unknown gender.

        if (this.active_context.pronoun_class.person === pronoun_class.person)
            if (this.active_context.pronoun_class.plurality === pronoun_class.plurality)
                if (this.active_context.pronoun_class.gender === pronoun_class.gender)
                    return true;
                else if (this.active_context.pronoun_class.gender === "UNKNOWN") {
                    if (pronoun_class.gender.match(/(MALE)|(FEMALE)|(UNSPECIFIED)/)) {
                        console.log("setting current context.gender to " + pronoun_class.gender)
                        this._update_active_context({
                            noun: this.active_context.noun,
                            pronoun_class: {
                                person: "THIRD-PERSON",
                                plurality: "SINGULAR",
                                gender: pronoun_class.gender
                            }
                        });
                        return true;
                    }
                }
        return false;
    }
    _trim_term1(term1) {
        let boundaryRegex = this._term_boundary_regex();

        term1 = term1.split(punctuationRegex);
        term1 = term1[term1.length - 1].trim(); //get last section.

        //trim word boundaries
        term1 = term1.split(boundaryRegex);
        term1 = term1[term1.length - 1].trim();

        return term1;
    }

    _trim_term2(term2) {
        let boundaryRegex = this._term_boundary_regex();

        term2 = term2.split(punctuationRegex);
        term2 = term2[0].trim(); //get first section.

        //trim word boundaries
        term2 = term2.split(boundaryRegex);
        term2 = term2[term2.length - 1].trim();

        return term2;
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

        let words = term.split(" ");
        for (let word of words) {
            //gender rule: search for gendered words.
            for (let gender_set of this.definitions.gendered_words) {
                if (Array.binarySearchBoolean(word, gender_set.words)) {
                    pronoun_class.gender = gender_set.gender;
                }
            }

            //gender rule: search for names.
            if (Array.binarySearchBoolean(word, this.names.male)) {
                pronoun_class.gender = "MALE";
                break;
            }
            else if (Array.binarySearchBoolean(word, this.names.female)) {
                pronoun_class.gender = "FEMALE";
                break;
            }
            else if (Array.binarySearchBoolean(word, this.names.unknown)) {
                pronoun_class.gender = "UNKNOWN";
                break;
            }
        }



        return pronoun_class;

    }
    _is_valid_term(string) {
        //returns true if the given string is a valid lexical term assuming no context.
        //blacklisted words are not valid.
        for (let word of this.definitions.term_blacklist) {
            if (string.search(new RegExp("\\b" + word + "\\b")) >= 0) return false;
        }

        //punctuation is not valid.
        console.log("checking ", string)
        if (string.match(punctuationRegex)) {
            console.log("punctuation!");
            return false;
        }

        //term boundaries are not valid.
        let boundaryRegex = this._term_boundary_regex();
        if (string.match(boundaryRegex)) {

            console.log("boundary!", boundaryRegex, string.match(boundaryRegex));
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

        //operators are not valid.
        for (let op of this.definitions.operators) {
            let pos = string.search(new RegExp("\\b" + op + "\\b"));
            if (pos >= 0) return false;
        }

        return true; //validation complete.
    }
    _run_macros(line) {
        //replaces special commands with their macro value.
        line = line
            .replace("\\USERNAME", this.options.user.username)
            .replace("\\MESSAGE", this.last_message);

        if (this.active_context) {
            if (this.active_context.fact) {
                let fact = this.active_context.fact;
                console.log("replacing for ", fact)
                line = line
                    .replace("\\FACT", this._transpose_fact(fact.term1) + " " + fact.operator + " " + this._transpose_fact(fact.term2))
                    .replace("\\PRONOUN_FACT", this._get_first_pronoun(this.active_context.pronoun_class) + " " + fact.operator + " " + this._transpose_fact(fact.term2));

                if (this.options.user.username === fact.negotiator.username) {
                    //this user gave the fact.
                    line = line
                        .replace("\\NEGOTIATOR_PRONOUN", this._get_first_pronoun({ person: "SECOND-PERSON", plurality: "SINGULAR", gender: fact.negotiator.gender }))
                        .replace("\\NEGOTIATOR", fact.negotiator.username)
                }
                else {
                    //another user gave the fact
                }


            }
            line = line
                .replace("\\NOUN", this._transpose(this.active_context.noun))
                .replace("\\PRONOUN", this._get_first_pronoun(this.active_context.pronoun_class))

        }

        //case properly.
        line = this._case(line);

        line = line.replace(new RegExp("\\b" + "eliza" + "\\b", "g"), "Eliza")
        return line;
    }
    _get_first_pronoun(pronoun_class) {
        //returns the first pronoun in the pronoun class given.
        let person = pronoun_class.person;
        let plurality = pronoun_class.plurality;
        let gender = pronoun_class.gender;
        for (let pronoun_group of this.definitions.pronoun_classes) {
            if (pronoun_group.person === person && pronoun_group.plurality === plurality && pronoun_group.gender === gender) {
                //this is the pronoun class. return first pronoun.
                return pronoun_group.pronouns[0];
            }
        }
    }
    _case(line) {
        line = line.toLowerCase().trim();
        let new_line = "";

        //capitalise names and special words.
        let words = line.toLowerCase().split(" "); //includes punctuation!
        for (let string of words) {
            let word = this._remove_punctuation(string)
            let punctuation = string.substr(string.search(word) + word.length);

            //case word
            //capitalise special words.
            if (word === "i") word = "I"
            else if (word === "i'm") word = "I'm"
            else if (word === "i'll") word = "I'll"

            else if (
                Array.binarySearchBoolean(word.toUpperCase(), this.names.male)
                ||
                Array.binarySearchBoolean(word.toUpperCase(), this.names.female)
                ||
                Array.binarySearchBoolean(word.toUpperCase(), this.names.unknown)
            ) {
                //capitalise name
                let new_word = "";
                for (let c in word) {
                    let char = word[c]
                    if (c == 0) char = char.toUpperCase();
                    new_word += char;
                }
                word = new_word;
            }
            new_line += " " + word + punctuation;
        }
        line = new_line;
        new_line = "";

        function getLastNonSpaceChar(string, position) {
            for (let c = position - 1; c >= 0; c--) {
                if (string[c] !== " ") return string[c];
            }
            return null;
        }
        //capitalise first letters.
        console.log(line)
        for (let c in line) {
            let char = line[c];
            if (char.match(/[a-z]/)) {
                //first letter of sentence is capitalised.
                let last_char = getLastNonSpaceChar(line, c);
                if (c == 0 || last_char === null || last_char.match(/[.!?]/)) {
                    char = char.toUpperCase();
                }
            }
            new_line += char;
        }
        return new_line;
    }
    _remove_punctuation(string) {
        //returns a new string with no punctuation marks.
        return string.replace(punctuationRegex, "");
    }
    _transpose(text) {
        //replaces words with FTs. use on the user message.
        let words = text.toUpperCase().split(" "); //includes punctuation!
        let output_string = "";
        for (let string of words) {
            let word = this._remove_punctuation(string)
            let punctuation = string.substr(string.search(word) + word.length);

            for (let transpose of this.definitions.transpose) {
                if (transpose.from.findIndex(t => t === word) >= 0) {
                    //word has a transposition. substitute.
                    word = transpose.to;
                    break;
                }
            }
            output_string += " " + word + punctuation;
        }
        return output_string;
    }
    _transpose_fact(text) {
        //replaces words with FTs. use on facts
        let words = text.toUpperCase().split(" "); //includes punctuation!
        let output_string = "";
        for (let string of words) {
            let word = this._remove_punctuation(string)
            let punctuation = string.substr(string.search(word) + word.length);

            for (let transpose of this.definitions.transpose) {
                if (transpose.from.findIndex(t => t === word) >= 0) {
                    //word has a transposition. substitute.
                    word = transpose.to;
                    break;
                }
            }
            output_string += " " + word + punctuation;
        }
        return output_string;
    }

    _format(text) {
        //replaces words with FTs. use on the user message.
        let words = text.toUpperCase().split(" "); //includes punctuation!
        let output_string = "";
        for (let string of words) {
            let word = this._remove_punctuation(string)
            let punctuation = string.substr(string.search(word) + word.length);

            for (let format of this.definitions.format) {
                if (format.from.findIndex(f => f === word) >= 0) {
                    //word has a format. substitute.
                    word = format.to;
                    break;
                }
            }
            output_string += " " + word + punctuation;
        }
        return output_string.trim();
    }

    _term_boundary_regex() {
        let regex = "";
        for (let boundary of this.definitions.term_boundaries) {
            regex += "" + boundary + "|"
        }
        return new RegExp("(\\b(" + regex.substr(0, regex.length - 1) + ")\\b)", "g");
    }
    _parse_definitions(definition_text) {

        //console.log("to parse: ", definition_text)

        var definitions = {
            sign_on: {
                new_user: [],
                known_user: [],
            },
            priority: [],
            transpose: [],
            format: [],
            null_entry: [],
            non_noun: [],
            non_fact: [],
            operators: [],
            fact_responses: [],
            term_boundaries: [],
            term_blacklist: [],
            pronoun_classes: [],
            gendered_words: [],
            query: [],
            fallback: [],
        }

        var definition_lines = definition_text.split("\n");
        //initialise context
        var current_index = null;
        var current_priority_keyword = null;
        var current_query_keyword = null;
        var current_fallback_keyword = null;
        for (let line of definition_lines) {
            let command = line[0] + line[1]; //two letter opcode as of new version.
            let text = line.substr(2).trim().toUpperCase();
            switch (command) {
                case 'S0':
                    //sign on message definition - new user
                    definitions.sign_on.new_user.push(text);
                    break;
                case 'S1':
                    //sign on message for known user.
                    definitions.sign_on.known_user.push(text);
                    break;
                case 'IF':
                    //get index of current priority keywords
                    current_index = definitions.query.findIndex(f => f.keywords.findIndex(k => k === current_priority_keyword) >= 0);
                    //query keyword
                    current_priority_keyword = text;
                    //does query already exist?
                    if (current_index >= 0) {
                        //add keyword to current keyword.
                        definitions.query[current_index].keywords.push(current_priority_keyword);
                    }
                    else {
                        //create keyword list member.
                        current_index = definitions.query.length;
                        definitions.priority.push({ keywords: [current_priority_keyword], responses: [], });
                    }
                    break;
                case 'RE':
                    //add response to priority keyword responses.
                    current_priority_keyword = null; //reset query keyword context.
                    definitions.priority[current_index].responses.push(text);
                    break;
                case 'TT':
                    //transpose to
                    current_index = definitions.transpose.length;
                    definitions.transpose.push({ to: text, from: [] });
                    break;
                case 'TF':
                    //transpose from
                    definitions.transpose[current_index].from.push(text);
                    break;
                case 'FT':
                    //format to
                    current_index = definitions.format.length;
                    definitions.format.push({ to: text, from: [] });
                    break;
                case 'FF':
                    //format from.
                    definitions.format[current_index].from.push(text);
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
                    current_index = definitions.pronoun_classes.length;
                    definitions.pronoun_classes.push({ person: pronoun_class[0], plurality: pronoun_class[1], gender: pronoun_class[2], pronouns: [] });
                    break;
                case 'PR':
                    //pronoun inside PC
                    definitions.pronoun_classes[current_index].pronouns.push(text);
                    break;
                case 'GC':
                    //gendered word class.
                    current_index = definitions.gendered_words.length;
                    definitions.gendered_words.push({ gender: text, words: [] });
                    break;
                case 'GW':
                    //word inside GC
                    definitions.gendered_words[current_index].words.push(text);
                    break;
                case 'TB':
                    //term boundary.
                    definitions.term_boundaries.push(text);
                    break;
                case 'TX':
                    //term blacklist entry.
                    definitions.term_blacklist.push(text);
                    break;
                case 'QK':
                    //get index of current fallback keywords
                    current_index = definitions.query.findIndex(f => f.keywords.findIndex(k => k === current_query_keyword) >= 0);
                    //query keyword
                    current_query_keyword = text;
                    //does query already exist?
                    if (current_index >= 0) {
                        //add keyword to current keyword.
                        definitions.query[current_index].keywords.push(current_query_keyword);
                    }
                    else {
                        //create keyword list member.
                        current_index = definitions.query.length;
                        definitions.query.push({ keywords: [current_query_keyword], responses: [], responses_yes: [], responses_no: [] });
                    }
                    break;
                case 'QR':
                    //add response to query keyword responses.
                    current_query_keyword = null; //reset query keyword context.
                    definitions.query[current_index].responses.push(text);
                    break;
                case 'QY':
                    //add response to query keyword responses.
                    current_query_keyword = null; //reset query keyword context.
                    definitions.query[current_index].responses_yes.push(text);
                    break;
                case 'QN':
                    //add response to query keyword responses.
                    current_query_keyword = null; //reset query keyword context.
                    definitions.query[current_index].responses_no.push(text);
                    break;
                case 'FR':
                    //fact response
                    definitions.fact_responses.push(text);
                case 'FK':
                    //get index of current fallback keywords
                    current_index = definitions.fallback.findIndex(f => f.keywords.findIndex(k => k === current_fallback_keyword) >= 0);
                    //fallback keyword
                    current_fallback_keyword = text;
                    //does fallback already exist?
                    if (current_index >= 0) {
                        //add keyword to current keyword.
                        definitions.fallback[current_index].keywords.push(current_fallback_keyword);
                    }
                    else {
                        //create keyword list member.
                        current_index = definitions.fallback.length;
                        definitions.fallback.push({ keywords: [current_fallback_keyword], responses: [] });
                    }
                    break;
                case 'FM':
                    //add response to fallback keyword responses.
                    current_fallback_keyword = null; //reset fallback keyword context.
                    definitions.fallback[current_index].responses.push(text);
                    break;
                default:
                    current_index = null;
                    break;
            }
        }
        console.log("DEFINITIONS PARSED: ", definitions)
        return definitions;
    }
    _fast_output(newmessage, agent = 'bot') {
        console.log("outputting fast", newmessage)
        this.output_html = this._construct_html(newmessage, agent);
        this.options.output.innerHTML = this.output_html;
    }

    async _output(text, agent = 'bot', nowait = false, callback = function () { }, callback_delay = 0) {
        console.log("outputting ", text)
        if (agent === 'bot' && !nowait) {
            await sleep(this.options.wait_time.response);
        }
        if (text.length > 0 && ((agent === 'bot' && this.options.wait_time.bot > 0) || (agent === 'user' && this.options.wait_time.user > 0))) {
            this.message = "";
            console.log(text)
            this.log.push({ agent, text });
            for (let char of text) {
                this._add_char(char, agent)
                this._update_container();
                if (agent === 'bot') await sleep(this.options.wait_time.bot);
                else await sleep(this.options.wait_time.user)

            }
            this.output_html = this._construct_html(text, agent);
        }
        else {
            this._fast_output(text, agent);
            this._update_container();
        }
        setTimeout(callback, callback_delay);

    }
    _update_container() {
        this.options.container.scrollTop = this.options.container.scrollHeight;
    }

    _construct_html(message, agent = 'bot') {
        if (agent && agent === 'bot') return this.output_html +
            "<div class='eliza_response'><span style='color:red'>ELIZA: </span>" + message + "</div>";
        else return this.output_html +
            "<div class='user_response'><span style='color:blue'>" + this.options.user.username + ": </span>" + message + "</div>";
    }

    _add_char(char, agent) {
        this.message += char;
        this.options.output.innerHTML = this._construct_html(this.message, agent);
    }
}
