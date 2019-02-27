// event listeners, makes our HTML Div elements respond to click
document.getElementById('enter-game-button').addEventListener('click', () => createOrJoinGame());
document.getElementById('hit-button').addEventListener('click', () => hit());
document.getElementById('stand-button').addEventListener('click', () => stand());

// use const instead of magic strings when possible
const DEALER = 'dealer';
const PLAYER = 'player';

// initialize global game variable
// note that after initialization, the game data will have the following relevant properties:
/*
{
    gamesWon: number,
    gamesLost: number,
    gameId: string,
    gameName: string,
    scores: {
        player: number,
        dealer: number
    },
    playerPile: {
        cards: [
            {
                value: 0-9 || JACK || QUEEN || KING || ACE,
                suit: string,
            }
        ]
    },
    dealerPile: object with same format as playerPile
}
*/
let game = {};

// response to player hitting 'enter-game-button'
// requests game for a given game name from our API server
// note that this is an async functions. This means that within this function, we can use the keyword 'await'.
// this allows us to minimize the number of callbacks we have to use
async function createOrJoinGame() {
    // get deck name from input
    const gameName = document.getElementById('deckNameInput').value;

    // make API call to server to either continue an existing game or create a new game
    const gameData = await fetch(`/game/${gameName}/getOrCreate`);

    // get JSON body of API response
    game = await gameData.json();

    // hide the login details, show the game details
    document.getElementById('login-wrapper').classList.add('hidden');
    document.getElementById('game-wrapper').classList.remove('hidden');

    // begin the game
    initGame();
};

// response to player clicking 'hit-button'
// gets card from API server, determines if player has lost based on newly drawn card
async function hit() {
    // draw card from API
    const playerPile = await fetch(`/game/${game.deckId}/draw/player`);
    // update player pile with the pile retrieved from the API
    // note that playerPile.json() is an async function, so we have to await it before asking for .piles.player
    game.playerPile = await playerPile.json();

    // update display with new card
    updateGameDisplay();

    // recalculate score
    game.scores[PLAYER] = scorePlayer(PLAYER);

    // use setTimeout to allow browser to re-draw cards before checking for a loss
    // don't worry about this workaround, it's probably beyond the scope of what you need to care about
    setTimeout(() => {

        // determine if player automatically wins or loses
        if (game.scores[PLAYER] > 21) {
            alert(`You lose, score = ` + game.scores[PLAYER]);
            endGame(DEALER);
        } else if (game.scores[PLAYER] == 21) {
            alert('You win, score = 21');
            endGame(PLAYER);
        }

    }, 1);
};

// response to player clicking 'stand-button'
// causes dealer to draw cards until satisfied, then calculates a winner
async function stand() {

    // most basic AI possible- dealer should draw if they have less than 17 points
    while(game.scores[DEALER] < 17) {
        // request new card for dealer from API
        const dealerPile = await fetch(`/game/${game.deckId}/draw/dealer`);

        // update dealer pile
        game.dealerPile = await dealerPile.json();

        // update dealer score
        game.scores[DEALER] = scorePlayer(DEALER);

        updateGameDisplay();
    }


    // determine game winner
    setTimeout(() => {

        if (game.scores[DEALER] > 21 || game.scores[DEALER] < game.scores[PLAYER]) {
            alert(`You win. ${game.scores[PLAYER]} to ${game.scores[DEALER]}`);
            endGame(PLAYER);
        } else {
            alert(`You lose. ${game.scores[PLAYER]} to ${game.scores[DEALER]}`);
            endGame(DEALER);
        }

    }, 1);
};

// calcualtes player score
function scorePlayer(player) {
    // determine if we are claculating a score for the player or the dealer
    const pile = player == PLAYER ? game.playerPile.cards : game.dealerPile.cards;

    let score = 0;
    // count aces, since they can be 1's or 11's
    let aceCount = 0;

    // fancy for loop, basically passes card in instead of needing to use pile[i] like a traditional for loop
    pile.forEach((card) => {

        // if the card value is numeric, we can directly add it
        if (!isNaN(card.value)) {
            // API represents 10s as 0s, so account for that in our addition
            score += card.value == 0 ? 10 : parseInt(card.value);
        // deal with face cards
        } else if (card.value == 'KING' || card.value == 'QUEEN' || card.value =='JACK') {
            score += 10;
        // otherwise we've got an ace- don't forget to count it.
        // we assume we want to count an ace as an 11
        } else {
            aceCount += 1;
            score += 11;
        }
    });

    // if we have aces and our score is too high, we want to count them as 1s instead of 11s
    while (score > 21 && aceCount > 0) {
        score -= 10;
        aceCount -= 1;
    }

    return score;
}

// finished with our game
async function endGame(gameWinner) {

    clearGameDisplay();

    // make API call to get a new deck and new starting draw
    const gameData = await fetch(`/game/${game.gameName}/endGame/${gameWinner}`);

    game = await gameData.json();

    initGame();
}

// set up scores/display after getting a new game object
function initGame() {

    game.scores[PLAYER] = scorePlayer(PLAYER);
    game.scores[DEALER] = scorePlayer(DEALER);

    updateGameDisplay();
}

// update visual components of the game
function updateGameDisplay() {
    // grab our card wrapper elements
    const pCardWrapper = document.getElementById('player-card-wrapper');
    const dCardWrapper = document.getElementById('dealer-card-wrapper');

    // remove all cards from them
    pCardWrapper.innerHTML = '';
    dCardWrapper.innerHTML = '';

    // give dealer their cards
    // draw new div elements for each card
    game.dealerPile.cards.forEach((c) => {
        // create div element
        const card = document.createElement('div');
        // give div a class 'card'
        card.classList.add('card');

        // give the card its text content, accounting for the 0 represented as a 10 thing
        card.innerHTML = c.value == 0 ? '10 of ' + c.suit : c.value + ' of ' + c.suit;

        // add the card to the appropriate wrapper element
        dCardWrapper.appendChild(card);
    });

    // give player their cards
    game.playerPile.cards.forEach((c) => {

        const card = document.createElement('div');

        card.classList.add('card');

        card.innerHTML = c.value == 0 ? '10 of ' + c.suit : c.value + ' of ' + c.suit;

        pCardWrapper.appendChild(card);
    });

    // update the score information
    document.getElementById('info-banner').innerHTML = `Games Won: ${game.gamesWon}, Games Lost: ${game.gamesLost}`;
}

// clears cards while loading the next game, to minimize confusion
function clearGameDisplay() {
    document.getElementById('player-card-wrapper').innerHTML = '';
    document.getElementById('dealer-card-wrapper').innerHTML = '';
}
