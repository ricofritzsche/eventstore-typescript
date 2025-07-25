import { EventStore, createFilter } from '../../../eventstore';

export interface GameState {
    gameId: string;
    player1Name: string;
    player2Name: string;
    currentPlayerIndex: number;
}

export class GetGameState{
    constructor(private eventStore: EventStore){
    }

    async process(gameId:string):Promise<GameState>{
        const filter = createFilter(["gameStarted", "currentPlayerChanged"], [{gameId}])
        console.log("###### ", filter)
        const context = await this.eventStore.query(filter)
        if (context.maxSequenceNumber == 0) throw new Error("Game not started!");

        const contextModel:GameState = context.events.reduce((acc, event) => {
            if (event.eventType === "gameStarted") {
                acc.gameId = event.payload.gameId as string;
                acc.player1Name = event.payload.player1Name as string;
                acc.player2Name = event.payload.player2Name as string;
            }
            if (event.eventType === "currentPlayerChanged") {
                acc.currentPlayerIndex = event.payload.currentPlayerIndex as number;
            }
            return acc;
        }, {} as GameState);

        return contextModel;
    }
}