import { EventStore } from 'jsr:@ricofritzsche/eventstore';
import { GameStartedEvent, CurrentPlayerChangedEvent } from './eventdictionary.ts';

export class StartGame{
    constructor(private eventStore: EventStore){
    }

    async process(player1Name:string, player2Name:string):Promise<string>{
        const gameStartedEvent:GameStartedEvent = {
            eventType: "gameStarted",
            payload: {
                gameId: crypto.randomUUID(),
                player1Name,
                player2Name
            }
        }
        const currentPlayerChanged:CurrentPlayerChangedEvent = {
            eventType: "currentPlayerChanged",
            payload: {
                gameId: gameStartedEvent.payload.gameId,
                currentPlayerIndex: 0
            }
        }
        
        await this.eventStore.append([gameStartedEvent, currentPlayerChanged])

        return gameStartedEvent.payload.gameId;
    }
}