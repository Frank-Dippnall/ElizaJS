# ElizaJS
A JavaScript implementation of Eliza (Weizenbaum, 1966) with long-term memory using a MySQL backend.


## What is this?
This is the source directory for my final year project at university, adding long-term memory to Eliza. It is a browser application that runs using Node.js and a MySQL server in the backend, but the actual chatterbot processing is done on the client side. It is mostly moduralised, and the js/eliza/ subdirectory can be used in other clients, however for convenience a single-page client application that instantiates Eliza in the client is supplied.

## How do I Run this?
You'll need Node.js, which you should probably already have, and some way to access a  MySQL server. [XAMPP](https://www.apachefriends.org/download.html) is easy for testing. Create a database for the project, change the database references to the name of your DB, and run the provided setup_db.sql file. This will setup the database. Be sure to change the login details in the server.js file so it can access the server, then start the server using "node /elizajs/server.js".If Node complains about dependencies, make sure you have installed the project's dependencies, listed in package.json.
