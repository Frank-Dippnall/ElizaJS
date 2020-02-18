-- ElizaJS - setup_db.sql
-- This MySQL code (re)initialises the DB, setting up the tables required and wiping any data already stored.

-- replace this with the name of the database.
use dippnalf;

-- drop all relevant tables
drop table if exists ElizaResult;
drop table if exists ElizaLog;
drop table if exists ElizaMemory;
drop table if exists ElizaAcquaintance;

-- create the tables.
create table ElizaLog(
    conversation_id int auto_increment primary key, 
    conversation_date datetime, username varchar(31), 
    log text, 
    bot_type varchar(10),
    is_blind boolean
);
create table ElizaResult(
    result_id int auto_increment primary key, 
    conversation_id int references ElizaLog(conversation_id), 
    result_date datetime, 
    score int(3), 
    notes text
);
create table ElizaAcquaintance(
    username varchar(31) primary key, 
    password varchar(63), 
    gender char(1), 
    meeting_date datetime
);
create table ElizaMemory (
	fact_id int auto_increment primary key, 
	negotiator varchar(31) references ElizaAcquaintance(username), 
    fact_date datetime, 
    term1 varchar(127), 
    operator varchar(15), 
    term2 varchar(127),
    UNIQUE KEY `no_duplicate_fact` (negotiator, term1, operator, term2));

-- some useful queries
select * from ElizaLog;
select * from ElizaAcquaintance;
select * from ElizaMemory inner join ElizaAcquaintance on ElizaMemory.negotiator = ElizaAcquaintance.username;

