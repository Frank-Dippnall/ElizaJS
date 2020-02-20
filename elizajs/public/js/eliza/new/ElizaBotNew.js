
/*
 * Francis Dippnall (17003003)
 * Eliza implementation in JavaScript. 
 * Based off of original Pascal code and using modified definition file.
 * 
 * New version with long-term memory.
 */



class ElizaBotNew {
    //set these to the same values in the db. and server.
    max_term_size = 127;
    min_term_size = 1;
    max_operator_size = 15;
    min_operator_size = 1;
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
                console.log("'male' nameset loaded. ")
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
                console.log("'female' nameset loaded.")
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
                console.log("'unknown' nameset loaded.")
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
                if (this.methods.log_conversation) this.methods.log_conversation(this.options.user.username, this.log);
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


                        let undefined_pronouns = []; //if this array has members after this for loop, abort.

                        context_application:
                        for (let pronoun_class of this.definitions.pronoun_classes) {
                            for (let p_type in pronoun_class.pronouns) {
                                let pronoun = pronoun_class.pronouns[p_type];
                                let pronoun_pos;
                                let pronounRegexStr = "\\b(" + pronoun + ")\\b";
                                let pronounRegex = new RegExp(pronounRegexStr);


                                //check for pronouns
                                pronoun_pos = term.search(pronounRegex);
                                if (pronoun_pos >= 0) {
                                    //pronoun found in term.
                                    if (this.active_context) {
                                        //a context exists. check if class matches.
                                        if (this._context_match(pronoun_class)) {
                                            if (pronoun_class.person === "THIRD-PERSON") {
                                                //referring to Active Context. replace with ACN.
                                                console.log(typeof p_type)
                                                if (p_type < 3) {
                                                    //nominative/objective/etc. replace with [noun].
                                                    term = term.replace(pronoun, this.active_context.noun);
                                                    console.log("replacing ", pronoun, " with ", this.active_context.noun, "in query.");

                                                }
                                                else {
                                                    //possessive. replace with [noun]'s
                                                    term = term.replace(pronoun, this._possessive(this.active_context.noun));
                                                    console.log("replacing ", pronoun, " with ", this._possessive(this.active_context.noun), "in query.")
                                                    break context_application;
                                                }
                                            }
                                            let temp_index = undefined_pronouns.findIndex(p => p === ("query: " + pronoun));
                                            if (temp_index >= 0) undefined_pronouns.splice(temp_index);
                                        }
                                        else undefined_pronouns.push("query: " + pronoun)
                                    }
                                    else {
                                        //no context exists. abort immediately
                                        break context_application;
                                    }
                                }
                            }
                        }


                        if (undefined_pronouns.length > 0) {
                            console.log("undefined pronouns detected: ", undefined_pronouns);
                            break query_request;
                        }


                        if (!this._is_valid_term(term)) {
                            console.log(term, "is not a valid term!");
                            break query_request;
                        }


                        console.log("term extracted: ", term);
                        //check special case - if query matches active context.
                        if (this.active_context && this.active_context.fact && term === this.active_context.fact.term1) {
                            //special case is true, use immediate responses.
                            if (this.active_context.fact_new) {
                                if (query.responses.immediate.new_fact.length > 0) {
                                    //use Q0 - new fact responses.
                                    callback(Array.getRandom(query.responses.immediate.new_fact));
                                    return;
                                }
                            }
                            else {
                                if (query.responses.immediate.retreived_fact.length > 0) {
                                    //use Q1 - retreived fact responses.
                                    callback(Array.getRandom(query.responses.immediate.retreived_fact));
                                    return;
                                }
                            }
                        }
                        //item is not active context or Q0/Q1 not defined - query factbase.
                        let eliza = this; //expose eliza to callback
                        //respond immediately.
                        this._output(this._case(Array.getRandom(query.responses.waiting)), "bot", false, function () {

                            eliza.methods.query_factbase(term, function (results) {
                                console.log("results of query: ", results)
                                //format results.
                                results = eliza._format_query_results(results);

                                if (results) {
                                    if (results.length > 0) {
                                        //select memory from list of known memories.
                                        let memory = Array.getRandom(results);
                                        if (memory.type === "fact") {
                                            let fact = memory.fact;
                                            //update context with fact from db
                                            eliza._update_active_context({
                                                noun: fact.term1,
                                                pronoun_class: eliza._estimate_pronoun_class(fact.term1, fact.negotiator),
                                                fact,
                                                fact_new: false
                                            });
                                            callback(Array.getRandom(query.responses.yes));
                                        }
                                        else {
                                            throw "unsupported memory type"
                                        }
                                    }
                                    else {
                                        //update context with provided query as noun.
                                        eliza._update_active_context({
                                            noun: term,
                                            pronoun_class: eliza._estimate_pronoun_class(term)
                                        });
                                        callback(Array.getRandom(query.responses.no));
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

            fact_extraction:
            for (let opclass of this.definitions.operator_classes) {
                for (let op of opclass.operators) {
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
                                    for (let p_type in pronoun_class.pronouns) {
                                        let pronoun = pronoun_class.pronouns[p_type];
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
                                                    if (pronoun_class.person === "THIRD-PERSON") {
                                                        //referring to Active Context. replace with ACN.
                                                        console.log(typeof p_type)
                                                        if (p_type < 3) {
                                                            //nominative/objective/etc. replace with [noun].
                                                            term1 = term1.replace(pronoun, this.active_context.noun);
                                                            console.log("replacing ", pronoun, " with ", this.active_context.noun);

                                                        }
                                                        else {
                                                            //possessive. replace with [noun]'s
                                                            term1 = term1.replace(pronoun, this._possessive(this.active_context.noun));
                                                            console.log("replacing ", pronoun, " with ", this._possessive(this.active_context.noun))
                                                            break;
                                                        }
                                                    }





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
                            console.log("either term1 or term2 is invalid. Abort fact extraction.", term1, term2)
                            break fact_extraction;
                        }

                        //context has been applied. 
                        //reaching this point means that the fact extraction is confirmed.
                        console.log("fact confirmed: " + term1 + "|" + op + "|" + term2);

                        //construct fact. 
                        let fact = this._tokenize({
                            fact_date: new Date(),
                            term1,
                            operator: op,
                            term2,
                            negotiator: {
                                username: this.options.user.username,
                                gender: this.options.user.gender
                            }
                        });

                        console.log("fact tokenized: " + fact.term1 + "|" + fact.operator + "|" + fact.term2);

                        //update active context the SUBJECT is term1 assumedly.
                        this._update_active_context({
                            noun: term1,
                            pronoun_class: this._estimate_pronoun_class(term1),
                            fact,
                            fact_new: true
                        })

                        //callback.
                        callback(Array.getRandom(this.definitions.fact_responses))

                        //send new fact to factbase.
                        if (this.methods.send_new_fact) {
                            this.methods.send_new_fact(fact);
                        }


                        return;
                        //do not continue searching since higher priority op found.
                    }
                }
            }

            //messages that make it past this point are "context-destroying" (see report for details)

            //PRIORITY 3 - catch chatter (greeting etc). "fallback keywords"
            //no facts found. check for fallback keywords.
            for (let fallback of this.definitions.fallback) {
                for (let keyword of fallback.keywords) {
                    let pos = message.search(new RegExp("\\b" + keyword + "\\b"));
                    if (pos >= 0) {
                        //keyword found. respond.
                        callback(Array.getRandom(fallback.responses));
                        //destroy context.
                        this._update_active_context(null);
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
                //destroy context
                this._update_active_context(null);
                return;
            }
        }
    }

    _possessive(word) {

        word = word.toUpperCase();
        //adds 's to the word. if word ends in 's' just adds '
        if (word[word.length - 1] === 'S') return word + "'"
        else return word + "'S";
    }
    _format_query_results(results) {
        for (let result of results) {
            if (result.type === 'fact') {
                result.fact.negotiator.gender = this._format_gender(result.fact.negotiator.gender)
                result.fact.fact_date = new Date(result.fact.fact_date);
            }
        }
        return results;
    }
    _context_match(pronoun_class) {
        //returns true if the given pronoun class matches the current context pronoun class.
        //also handles unknown gender.

        if (this.active_context.pronoun_class.person === pronoun_class.person)
            if (this.active_context.pronoun_class.plurality === pronoun_class.plurality)
                if (this.active_context.pronoun_class.gender === pronoun_class.gender)
                    return true;
                else if (this.active_context.pronoun_class.gender === "UNKNOWN") {
                    if (pronoun_class.gender.match(/(MALE)|(FEMALE)|(GENDERLESS)/)) {
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
        if (context){
            if (context.fact) context.fact.negotiator.gender = this._format_gender(context.fact.negotiator.gender)
            if (context.pronoun_class) context.pronoun_class.gender = this._format_gender(context.pronoun_class.gender)
        }
        this._active_context = context;
        console.log("changed active context to ", context)
    }
    get active_context() {
        return this._active_context;
    }


    _estimate_pronoun_class(term, negotiator = null) {
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
        gender_rules:
        for (let word of words) {
            //gender rule: user username
            if (word === this.options.user.username) {
                pronoun_class.gender = this.options.user.gender;
                break gender_rules;
            }
            //gender rule - negotiator username
            if (negotiator) {
                if (word === negotiator.username) {
                    pronoun_class.gender = negotiator.gender;
                    break gender_rules;
                }
            }

            //gender rule: search for gendered words.
            for (let gender_set of this.definitions.gendered_words) {
                //console.log("searching for '" + word + "' in", gender_set)
                if (gender_set.words.findIndex(w => w === word) >= 0) {
                    console.log(word, "found in ", gender_set)
                    pronoun_class.gender = gender_set.gender;
                    break gender_rules;
                }
            }

            //gender rule: search for names.
            if (Array.binarySearchBoolean(word, this.names.male)) {
                pronoun_class.gender = "MALE";
                break gender_rules;
            }
            else if (Array.binarySearchBoolean(word, this.names.female)) {
                pronoun_class.gender = "FEMALE";
                break gender_rules;
            }
            else if (Array.binarySearchBoolean(word, this.names.unknown)) {
                pronoun_class.gender = "UNKNOWN";
                break gender_rules;
            }
        }



        return pronoun_class;

    }
    _is_valid_term(string) {
        //returns true if the given string is a valid lexical term assuming no context.
        console.log("checking if '" + string + "' is a valid term...")
        //must be valid length.
        if (string.length > this.max_term_size) {
            console.log("term is too large! " + this.max_term_size + " is the limit.");
            return false;
        }
        if (string.length < this.min_term_size) {
            console.log("term is too small! " + this.min_term_size + " is the minimum.");
            return false;
        }


        //blacklisted words are not valid.
        for (let word of this.definitions.term_blacklist) {
            if (string.search(new RegExp("\\b" + word + "\\b")) >= 0) return false;
        }

        //punctuation is not valid.

        let char;

        if (char = string.match(punctuationRegex)) {
            console.log("punctuation!");
            return false;
        }

        // invalid characters are not valid.

        if (char = string.match(invalidCharacterRegex)) {
            console.log("invalid character '" + char + "'")
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
        for (let opclass of this.definitions.operator_classes) {
            for (let op of opclass.operators) {
                let pos = string.search(new RegExp("\\b" + op + "\\b"));
                if (pos >= 0) return false;
            }
        }

        return true; //validation complete.
    }
    _run_macros(line) {
        console.log("before macros: ", line)
        //replaces special commands with their macro value.
        line = line
            .replace("\\USERNAME", this.options.user.username)
            .replace("\\MESSAGE", this.last_message);

        if (this.active_context) {
            if (this.active_context.fact) {

                //deep copy.
                //transpose fact for output.
                let fact = this._transpose_fact(JSON.parse(JSON.stringify(this.active_context.fact)));

                console.log("replacing for ", fact)
                let timestring = Date.createTimeString(fact.fact_date);
                console.log("timestring made: ", timestring)
                line = line
                    .replace("\\FACT", fact.term1 + " " + fact.operator + " " + fact.term2)
                    .replace("\\PRONOUN_FACT", this._get_relevant_pronoun(this.active_context) + " " + fact.operator + " " + fact.term2)
                    .replace("\\TIMESTRING", timestring)

                if (this.options.user.username === fact.negotiator.username) {
                    //this user gave the fact.
                    line = line
                        .replace("\\NEGOTIATOR_PRONOUN", "YOU")
                        .replace("\\NEGOTIATOR", "YOU")
                }
                else {
                    //another user gave the fact
                    line = line
                        .replace("\\NEGOTIATOR_PRONOUN", this._get_negotiator_pronoun(this.active_context))
                        .replace("\\NEGOTIATOR", fact.negotiator.username)
                }


            }
            line = line
                .replace("\\NOUN", this._transpose_noun(this.active_context))
                .replace("\\PRONOUN", this._get_relevant_pronoun(this.active_context))

        }
        //replace [username]'s with "your"
        line = line.replace(new RegExp("\\b" + this.options.user.username.toUpperCase() + "'S" + "\\b", "g"), "your")
        //replace [username] with "you"
        line = line.replace(new RegExp("\\b" + this.options.user.username.toUpperCase() + "\\b", "g"), "you")

        if (line.search(/\\/) >= 0) {
            //if macro commands still present, abort.
            console.log("unhandled macro commands. Aborting.")
            line = Array.getRandom(this.definitions.non_noun);
        }

        //case properly.
        line = this._case(line);

        line = line.replace(new RegExp("\\b" + "eliza" + "\\b", "g"), "Eliza")
        return line;
    }
    _get_negotiator_pronoun(context) {
        let pronoun_class = {
            person: "THIRD-PERSON",
            plurality: "SINGULAR",
            gender: this._format_gender(context.fact.negotiator.gender)
        }
        let person = pronoun_class.person;
        let plurality = pronoun_class.plurality;
        let gender = pronoun_class.gender;
        for (let pronoun_group of this.definitions.pronoun_classes) {
            if (pronoun_group.person === person && pronoun_group.plurality === plurality && (pronoun_group.gender === gender || pronoun_class.gender === undefined)) {
                //this is the pronoun class. return first pronoun.
                console.log("negotiator pronoun in ", pronoun_class, " is", pronoun_group.pronouns[0])
                return pronoun_group.pronouns[0];
            }
        }
        throw "invalid pronoun class"
    }

    _get_specific_pronoun(pronoun_class, ptype) {
        for (let pronoun_group of this.definitions.pronoun_classes) {
            if (pronoun_group.person === pronoun_class.person && pronoun_group.plurality === pronoun_class.plurality && (pronoun_group.gender === pronoun_class.gender || pronoun_class.gender === undefined)) {
                //this is the pronoun class. return first pronoun.
                console.log("ptype " + ptype + " pronoun in ", pronoun_class, " is", pronoun_group.pronouns[ptype])
                return pronoun_group.pronouns[ptype];
            }
        }
    }
    _get_relevant_pronoun(context, ptype = 0) {
        //returns the relevant pronoun for the given context.

        if (context.fact && context.noun === this.options.user.username) return "YOU";
        else {
            let pronoun_class = context.pronoun_class

            let person = pronoun_class.person;
            let plurality = pronoun_class.plurality;
            let gender = pronoun_class.gender;
            for (let pronoun_group of this.definitions.pronoun_classes) {
                if (pronoun_group.person === person && pronoun_group.plurality === plurality && (pronoun_group.gender === gender || pronoun_class.gender === undefined)) {
                    //this is the pronoun class. return first pronoun.
                    console.log("selected pronoun in ", pronoun_class, " is", pronoun_group.pronouns[ptype])
                    return pronoun_group.pronouns[ptype];
                }
            }
            throw "invalid pronoun class"
        }
    }
    _format_gender(gender) {
        let g = gender.toLowerCase();
        if (g === "m" || g === "male") return "MALE";
        if (g === "f" || g === "female") return "FEMALE";
        if (g === "" || g === "unknown") return "UNKNOWN";
        if (g === "x" || g === "genderless") return "GENDERLESS";
    }
    _case(line) {
        line = line.toLowerCase().trim();
        let new_line = "";

        //capitalise names and special words.
        let words = line.toLowerCase().split(" "); //includes punctuation!
        for (let string of words) {

            let word = this._remove_punctuation(string);
            //save punctuation for later.
            let punc_post = string.substr(string.search(word) + word.length);
            let punc_pre = string.substr(0, string.search(word));
            let suffix = "";
            //handle possessives.
            if (word.substr(word.length - 2) === "'s") {
                word = word.substr(0, word.length - 2);
                suffix = "'s";
            }
            //case word
            //capitalise special words.
            if (word === "i") word = "I"
            else if (word === "i'm") word = "I'm"
            else if (word === "i'll") word = "I'll"
            //brands & names
            else if (word === "github") word = "GitHub";
            else if (word === "elizajs") word = "ElizaJS";


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
            new_line += " " + punc_pre + word + suffix + punc_post;
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
        line = new_line.trim();
        console.log("after casing: \"" + line + "\"")
        return line;
    }
    _remove_punctuation(string) {
        //returns a new string with no punctuation marks.
        return string.replace(punctuationRegex, "");
    }

    _tokenize(fact) {
        let negotiator = fact.negotiator;
        console.log("tokenizing fact for storage: ", fact)
        let eliza = this;
        function tokenize(string) {
            //replaces words with tokens such that they may be understood in any context.
            let context = eliza.active_context;
            let words = string.toUpperCase().split(" "); //includes punctuation!
            let output_string = "";
            for (let string of words) {
                let word = eliza._remove_punctuation(string)
                let punctuation = string.substr(string.search(word) + word.length);
                //tokenize using pronoun transformation.
                for (let pronoun_class of eliza.definitions.pronoun_classes) {
                    if (pronoun_class.person === "FIRST-PERSON") {
                        let p_type = pronoun_class.pronouns.findIndex(p => p === word);
                        if (p_type >= 0) {
                            //pronoun found.
                            if (p_type < 3) {
                                //nominative/objective etc. replace with [negotiator].
                                word = negotiator.username;
                            }
                            else {
                                //possessive. replace with [negotiator]'s
                                word = eliza._possessive(negotiator.username);
                            }
                            break;
                        }
                    }


                }
                //add the punctuation back in.
                output_string += " " + word + punctuation;
            }
            return output_string.trim();
        }

        //return deep copy with tokenization and repair
        return {
            fact_date: fact.fact_date,
            term1: tokenize(fact.term1),
            operator: fact.operator,
            term2: tokenize(fact.term2),
            negotiator: {
                username: fact.negotiator.username,
                gender: fact.negotiator.gender
            }
        }
    }
    _transpose_fact(fact) {
        if (fact.negotiator.username === this.options.user.username) {
            return {
                fact_date: fact.fact_date,
                term1: this._transpose_old(fact.term1),
                operator: this._transpose_old(fact.operator),
                term2: this._transpose_old(fact.term2),
                negotiator: fact.negotiator
            };
        }
        else {
            return {
                fact_date: fact.fact_date,
                term1: this._transpose_new(fact.negotiator, fact.term1),
                operator: this._transpose_new(fact.negotiator, fact.operator, "operator"),
                term2: this._transpose_new(fact.negotiator, fact.term2),
                negotiator: fact.negotiator
            };
        }
    }

    _transpose_noun(context) {
        let noun = context.noun;
        if (context.fact) {
            if (context.fact.negotiator.username === noun) {
                if (noun === this.options.user.username) {
                    return this._get_specific_pronoun({ person: "SECOND-PERSON", plurality: "SINGULAR", gender: undefined }, 2) //objective-self
                }
                else {
                    return this._get_specific_pronoun({ person: "THIRD-PERSON", plurality: "SINGULAR", gender: context.fact.negotiator.gender }, 2) //objective-self
                }

            }
        }
        return this._transpose_old(context.noun);
    }

    _transpose_new(negotiator, string, type = "term") {
        let new_string = string;
        switch (type) {
            case "term":
                for (let pronoun_class of this.definitions.pronoun_classes) {

                }
                break;
            case "operator":
                let op = string;

                for (let opclass of this.definitions.operator_classes) {
                    for (let operator of opclass.operators) {
                        if (op === operator) {
                            if (negotiator.username === this.options.user.username) {
                                //referring to current user. do NOT add 's'
                                return op;
                            }
                            else if (opclass.name === "ADD-S") {
                                //referring to third person. add 's'
                                return op[op.length - 1] === 's' ? op : op + 's';
                            }
                            else {
                                return op;
                            }
                        }
                    }
                }
                console.log("unrecognised ooperator!")
                return op;
        }
        return new_string;

    }

    _transpose_old(string) {
        //use old 2P transposition table if negotiator is current user
        let context = this.active_context;
        //replaces words in terms depending on negotiator and active context. 
        let words = string.toUpperCase().split(" "); //includes punctuation!
        let output_string = "";
        for (let string of words) {
            let word = this._remove_punctuation(string)
            let punctuation = string.substr(string.search(word) + word.length);
            //replace word with transposition, depending on context.
            //also use if no fact is in context.
            for (let transpose of this.definitions.transpose) {
                if (transpose.from === word) {
                    //replace word with transposition.
                    console.log("replacing ", word, "with", transpose.to, "from old transposition table.");
                    word = transpose.to;
                    break; //stop searching for transpose-or it might be transposed back!
                }
            }
            //add the punctuation back in.
            output_string += " " + word + punctuation;
        }
        return output_string.trim();
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
        return output_string.replace("\\USERNAME", this.options.user.username).trim();
    }

    _term_boundary_regex() {
        //construct regex for term boundary.
        let regex = "";
        for (let boundary of this.definitions.term_boundaries) {
            regex += "" + boundary + "|"
        }
        return new RegExp("(\\b(" + regex.substr(0, regex.length - 1) + ")\\b)", "g");
    }

    _parse_definitions(definition_text) {
        //parse definition.net file.
        //console.log("to parse: ", definition_text)

        var definitions = {
            sign_on: {
                new_user: [],
                known_user: [],
            },
            priority: [],
            transpose: [],
            new_transpose: [],
            format: [],
            null_entry: [],
            non_noun: [],
            non_fact: [],
            operator_classes: [],
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
                    definitions.transpose.push({ to: text, from: undefined });
                    break;
                case 'TF':
                    //transpose from.
                    definitions.transpose[current_index].from = text;
                    break;
                case 'T0':
                    //transpose to
                    current_index = definitions.new_transpose.length;
                    definitions.new_transpose.push({ to: undefined, from: text });
                    break;
                case 'T1':
                    //transpose from.
                    definitions.new_transpose[current_index].to = text;
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
                case 'OC':
                    current_index = definitions.operator_classes.length;
                    definitions.operator_classes.push({ name: text, operators: [] });
                    break;
                case 'OP':
                    //operator.
                    definitions.operator_classes[current_index].operators.push(text);
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
                        definitions.query.push({ keywords: [current_query_keyword], responses: { waiting: [], yes: [], no: [], immediate: { new_fact: [], retreived_fact: [] } } });
                    }
                    break;
                case 'QR':
                    //add response to query keyword responses.
                    current_query_keyword = null; //reset query keyword context.
                    definitions.query[current_index].responses.waiting.push(text);
                    break;
                case 'QY':
                    //add response to query keyword responses.
                    current_query_keyword = null; //reset query keyword context.
                    definitions.query[current_index].responses.yes.push(text);
                    break;
                case 'QN':
                    //add response to query keyword responses.
                    current_query_keyword = null; //reset query keyword context.
                    definitions.query[current_index].responses.no.push(text);
                    break;
                case 'Q0':
                    //add response to query immediate responses.
                    current_query_keyword = null; //reset query keyword context.
                    definitions.query[current_index].responses.immediate.new_fact.push(text);
                    break;
                case 'Q1':
                    //add response to query immediate responses.
                    current_query_keyword = null; //reset query keyword context.
                    definitions.query[current_index].responses.immediate.retreived_fact.push(text);
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
            }
        }
        console.log("DEFINITIONS PARSED: ", definitions)
        return definitions;
    }
    //outputting functions
    _fast_output(newmessage, agent = 'bot') {
        console.log("outputting fast", newmessage)
        this.output_html = this._construct_html(newmessage, agent);
        this.options.output.innerHTML = this.output_html;
    }

    async _output(text, agent = 'bot', nowait = false, callback = function () { }, callback_delay = 0) {
        console.log("outputting \"" + text + "\"")
        if (agent === 'bot' && !nowait) {
            await sleep(this.options.wait_time.response);
        }
        if (text.length > 0 && ((agent === 'bot' && this.options.wait_time.bot > 0) || (agent === 'user' && this.options.wait_time.user > 0))) {
            this.message = "";
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
