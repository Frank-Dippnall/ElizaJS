/*
 * Francis Dippnall (17003003)
 * 
 * ElizaBot code module.
 * 
 */

var ElizaBot = {};
ElizaBot.createInstance = function (type, options, methods) {
    //type: 'old' or 'new'. type of bot to create. new has long-term memory.
    //options: object full of eliza options. see class for more info.
    //methods: object full of exposed client-server methods using the socket connection.
    switch (type) {
        case "old": return new ElizaBotOld(options, methods);
        case "new": return new ElizaBotNew(options, methods);
        default: throw "Invalid type parameter. Use either 'old' or 'new'";
    }
}
//return a random element of the provided array.
Array.getRandom = function (array) {
    return (array[Math.floor(Math.random() * array.length)]);
}

Array.binarySearchBoolean = function (search_item, sorted_array) {
    //recursive binary search. returns true if element inside array. 
    if (sorted_array.length < 2)
        if (search_item === sorted_array[0]) return true;
        else return false;
    let index = Math.floor(sorted_array.length / 2);
    let current_item = sorted_array[index];
    if (search_item < current_item) {
        return Array.binarySearchBoolean(search_item, sorted_array.slice(0, index));
    }
    else if (search_item > current_item) {
        return Array.binarySearchBoolean(search_item, sorted_array.slice(index + 1));
    }
    else if (search_item === current_item) {
        return true; //item found.
    }
    console.log("Array.binarySearchBoolean should not exit here!");
    return undefined;
}

//pause async thread operation for 'ms' milliseconds.
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}