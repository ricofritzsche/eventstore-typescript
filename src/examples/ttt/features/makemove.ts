import { EventStore } from '../../../eventstore';
import { PlayerMadeMove } from './eventdictionary';

export class MakeMove{
    constructor(private eventStore: EventStore){
    }

    async process(gameId:string, playerIndex:number):Promise<void>{
        const playerMadeMoveEvent:PlayerMadeMove = {
            eventType: "playerMadeMove",
            payload: {
                gameId,
                playerIndex
            }
        }

        await this.eventStore.append([playerMadeMoveEvent])
    }
}