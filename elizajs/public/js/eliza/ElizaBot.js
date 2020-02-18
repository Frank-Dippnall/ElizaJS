/*
 * Francis Dippnall (17003003)
 * 
 * ElizaBot code module.
 * 
 */

var ElizaBot = {};

Date.createTimeString = function (date) {

    if (typeof date === 'string') date = new Date(date);
    console.log("creating timestring for date", date, typeof date)

    let secondTime = 1000;
    let minuteTime = secondTime * 60;
    let hourTime = minuteTime * 60;
    let dayTime = hourTime * 24;
    let weekTime = dayTime * 7;
    let monthTime = weekTime * 4;
    let yearTime = monthTime * 12;


    //returns a string with a more human interpretation of the given date, in relation to today.
    let now = new Date();
    let msdiff = now.getTime() - date.getTime();

    let year = Math.floor(msdiff / yearTime);
    if (year == 0) {
        let month = Math.floor(msdiff / monthTime);
        if (month == 0) {
            let week = Math.floor(msdiff / weekTime);
            if (week == 0) {
                let day = Math.floor(msdiff / dayTime);
                if (day == 0) {
                    let hour = Math.floor(msdiff / hourTime);
                    if (hour == 0) {
                        let minute = Math.floor(msdiff / minuteTime);
                        if (minute == 0) {
                            return "just now";
                        }
                        else if (minute == 1) return "" + minute + " minute ago";

                        else return "" + minute + " minutes ago";

                        console.log(year)
                    }
                    else if (hour == 1) return "" + hour + " hour ago";

                    else return "" + hour + " hours ago";

                    console.log(year)
                }
                else if (day == 1) return "" + day + " day ago";

                else return "" + day + " days ago";

                console.log(year)
            }
            else if (week == 1) return "" + week + " week ago";

            else return "" + week + " weeks ago";

            console.log(year)
        }
        else if (month == 1) return "" + month + " month ago";

        else return "" + month + " months ago";

        console.log(year)
    }
    else if (year == 1) return "" + year + " year ago";
    else return "" + year + " years ago";
    console.log(year)
}

//ElizaBot factory pattern.
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
    //ARRAY must be sorted!
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