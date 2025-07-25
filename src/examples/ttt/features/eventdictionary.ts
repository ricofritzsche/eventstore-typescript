export interface GameStartedEvent{
    eventType: "gameStarted";
    payload: {
        gameId: string;
        player1Name: string;
        player2Name: string;
    }
}

export interface CurrentPlayerChangedEvent{
    eventType: "currentPlayerChanged";
    payload: {
        gameId: string;
        currentPlayerIndex: number; // zero based
    }
}

export interface PlayerMadeMove{
    eventType: "playerMadeMove";
    payload: {
        gameId: string;
        playerIndex: number; // zero based
    }
}