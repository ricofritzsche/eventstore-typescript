import inquirer  from 'inquirer';

import { PostgresEventStore } from '@ricofritzsche/eventstore';
import { StartGame } from './features/startgame';
import { GetGameState, GameState } from "./features/getgamestate";
import { MakeMove } from "./features/makemove";

import dotenv from 'dotenv';
import process, { mainModule } from 'node:process';  


async function main() {
    dotenv.config();
    const connectionString = process.env.DATABASE_URL

    const es = new PostgresEventStore({ connectionString: connectionString });
    await es.initializeDatabase();
    console.log("Playing on this database: " + connectionString)


    const startGame = new StartGame(es);
    const getGameState = new GetGameState(es);
    const makeMove = new MakeMove(es);


    try {
        console.log("\n\n$ deno run ./game.ts\n")

        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'player1Name',
                message: 'Player 1'
            },
            {
                type: 'input',
                name: 'player2Name',
                message: 'Player 2'
            },
        ]);

        const gameId = await startGame.process(answers.player1Name, answers.player2Name);
        console.log(`\nWelcome to the game, players ${answers.player1Name} and ${answers.player2Name}! (${gameId})\n`);

        while (true) {
            const gameState:GameState = await getGameState.process(gameId);
            const currenPlayerName = gameState.currentPlayerIndex === 0 ? gameState.player1Name : gameState.player2Name;

            await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'continue',
                    message: `${currenPlayerName}, it's your turn`
                }
            ]);

            await makeMove.process(gameId, gameState.currentPlayerIndex);
        }
    } finally {
        es.close();
    }

}


main()