// import appropriate modules

// mysql module, for mysql requests
const mysql = require('mysql');

// util, to allow us to use async/await
// util is built in to nodejs, so we don't have to install it
const utils = require('util');

// axios, to make API requests
const axios = require('axios');

// express, to maintain our API server
const express = require('express');

// API post body middleware
const bodyParser = require('body-parser');

// local json file with important data/global constants
const config = require('./config.json');


// initialize our API server
const app = express();

// POST body middleware (parses POST body to json for use in routes)
app.use(bodyParser.json());

// establish mysql connection settings
const conn = mysql.createConnection({
    host: config.mysqlHost,
    user: config.mysqlUser,
    password: config.mysqlPassword,
    database: config.mysqlDatabase
});

// make conn.query a promise, this allows us to use 'await' instead of a callback
// don't worry about the details of this, just include this line
// now instead of using 'conn.query(query, params, callback)' we'll use 'await query'
const query = utils.promisify(conn.query).bind(conn);

// connect to our mysql database
conn.connect((err) => {
    if (err) {
        console.log('Unable to connect to mysql');
        throw err;
    }
});

// match base route to index.html
// this is a basic express route. the general format is app.get(routeString, callback)
// where 'get' is the HTTP method (i.e. GET/POST/PUT),
// routeString is a string starting with / and 
// callback includes at least two params: (request, response)
app.get('/', (req, res) => {
    // intercepts requests to localhost:PORT/, and renders our index page
    // __dirname is a special nodejs variable containing the current directory path
    res.sendFile(`${__dirname}/public/index.html`);
});

// match all file requests to public folder (this allows js/css links in your html)
// this means to get to our index page, you can either go to localhost:PORT/ or localhost:/PORT/index.html
app.get('/:filename', (req, res) => {
    res.sendFile(`${__dirname}/public/${req.params.filename}`);
});

// route to match requests to get an existing or create a new blackjack game
// the /:gameName/ is a variable path. This means this route will match to
// /game/example1/getOrCreate
// /game/randomName/getOrCreate
// but will not match to
// /game/name/otherthing/getOrCreate
// the gameName is accessible via req.params.gameName
// Also note that our route has a callback which is async-
// this means we can use await inside our callback, as opposed to having nested callbacks
app.get('/game/:gameName/getOrCreate', async (req, res) => {

    // establish our SQL query, using ? as our query parameters
    let qString = 'SELECT gameName, deckId, gamesWon, gamesLost FROM games WHERE gameName = ?';
    // execute the query- note we are using 'await query', instead of conn.query(qString, params, callback)
    // the second parameter is an array of values to replace ? in our query, in order of use in the query
    const response = await query(qString, [req.params.gameName]);
    // if there is an empty array as response, our query returned 0 rows
    if (response.length == 0) {
        // here, we are using axios to make an API request to our deckOfCardsAPI.
        // note that the response content (JSON) is in the return from axios.get object, at the data key.
        // that's why we must 'await' the response from the request before accessing the .data
        const newDeckData = (await axios.get(`${config.apiEndpoint}/new/shuffle/?deck_count=1`)).data;

        // grab the deck id
        const deckId = newDeckData.deck_id;

        // build our mysql query to save our deck id
        qString = 'INSERT INTO games (gameName, deckId) VALUES (?, ?)';

        // save the new game to the DB
        await query(qString, [req.params.gameName, deckId]);

        // the game starts with each player having two cards.
        // each card must be drawn before we draw the next card, so we await the finish of each draw before drawing the next card
        await drawCardToHand(deckId, 'player');
        await drawCardToHand(deckId, 'dealer');
        await drawCardToHand(deckId, 'player');
        await drawCardToHand(deckId, 'dealer');

        // get each player's pile of cards
        const playerPileData = await getPileData(deckId, 'player');
        const dealerPileData = await getPileData(deckId, 'dealer');

        // return the appropriate game data to the client
        res.json({
            gameName: req.params.gameName,
            deckId: deckId,
            gamesWon: 0,
            gamesLost: 0,
            dealerPile: dealerPileData,
            playerPile: playerPileData,
            scores: {}
        });
    } else {
        // the game already existed in the database, so we just need to get each player's respective pile
        const deckId = response[0].deckId;
        const playerPileData = await getPileData(deckId, 'player');
        const dealerPileData = await getPileData(deckId, 'dealer');

        // ... is the spread operator
        // return relevant game data to client
        res.json({
            ...response[0],
            dealerPile: dealerPileData,
            playerPile: playerPileData,
            scores: {}
        });
    }
});

// respond to requests to draw cards
app.get('/game/:deckId/draw/:player', async (req, res) => {
    // draw the card
    await drawCardToHand(req.params.deckId, req.params.player);

    // return the appropriate player's pile data
    res.json(await getPileData(req.params.deckId, req.params.player));
});

// respond to the end of a game
app.get('/game/:gameName/endGame/:winner', async (req, res) => {

    // make api request for a new deck id
    const newDeckData = (await axios.get(`${config.apiEndpoint}/new/shuffle/?deck_count=1`)).data;
    const deckId = newDeckData.deck_id;

    let qString;
    // generate query to update relevant row in DB with a new deckId and update games won/lost
    if (req.params.winner == 'player') {
        qString = 'UPDATE games SET deckId = ?, gamesWon = gamesWon + 1 WHERE gameName = ?';
    } else {
        qString = 'UPDATE games SET deckId = ?, gamesLost = gamesLost + 1 WHERE gameName = ?';
    }
    // update row, then get players new cards
    await query(qString, [deckId, req.params.gameName]);
    await drawCardToHand(deckId, 'player');
    await drawCardToHand(deckId, 'dealer');
    await drawCardToHand(deckId, 'player');
    await drawCardToHand(deckId, 'dealer');

    // get player piles
    const playerPileData = await getPileData(deckId, 'player');
    const dealerPileData = await getPileData(deckId, 'dealer');

    // get game data from DB
    qString = 'SELECT gameName, deckId, gamesWon, gamesLost FROM games WHERE gameName = ?';
    const response = await query(qString, [req.params.gameName]);

    // return game data to client
    res.json({
        gameName: req.params.gameName,
        deckId: deckId,
        gamesWon: response[0].gamesWon,
        gamesLost: response[0].gamesLost,
        dealerPile: dealerPileData,
        playerPile: playerPileData,
        scores: {}
    });
});

// make api call to draw a card to a specific hand
// note- hand should either be 'dealer' or 'player'
async function drawCardToHand(deckId, hand) {
    // draw card from deck
    const drawResponse = (await axios.get(`${config.apiEndpoint}/${deckId}/draw/?count=1`)).data;

    // place card in appropriate hand
    await axios.get(`${config.apiEndpoint}/${deckId}/pile/${hand}/add/?cards=${drawResponse.cards[0].code}`);
    return;
}

// make api call to get specified hand data
async function getPileData(deckId, hand) {
    const res = (await axios.get(`${config.apiEndpoint}/${deckId}/pile/${hand}/list`)).data;
    return res.piles[hand];
}

// run our express server
app.listen(config.PORT, () => {
    console.log(`Server running on port ${config.PORT}`);
});
