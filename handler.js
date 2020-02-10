'use strict';

const AWS = require('aws-sdk');
const uuid = require('uuid-random');

const ATTACKERS = "attackers";
const DEFENDERS = "defenders";


module.exports = {
    create: async (event, context) => {
        console.log("create -> start with event:{} and context: {}", event, context)
        let bodyObj = {}
        try {
            bodyObj = JSON.parse(event.body)
        } catch (jsonError) {
            console.log('There was an error parsing the body', jsonError)
            return {
                statusCode: 400
            }
        }
        console.log("bodyObj: ", bodyObj);
        if (typeof bodyObj.attackerGroup === 'undefined' ||
            typeof bodyObj.defenderGroup === 'undefined' ||
            typeof bodyObj.players === 'undefined' ||
            typeof bodyObj.place === 'undefined') {
            console.log('Missing parameters ');
            return {
                statusCode: 400
            }
        }
        let gameList = await fetchGameList();
        let gameListObj = parsEventToJson(gameList);
        console.log("create -> gameList: ", gameListObj);
        if (!!gameListObj) {
            let activeGame = findActiveGame(gameListObj);
            console.log("create -> activeGame: ", activeGame);
            if (!!activeGame ) {
                return {
                    statusCode: 200,
                    body: JSON.stringify(activeGame)
                }
            } else {
               return  await createGame(bodyObj);

            }
        }
        return {
            statusCode: 404,
            body: JSON.stringify("Create the first game.")

        };
    },
    list: async (event, context) => {
        console.log("list -> start with event:{} and context: {}", event, context);
        return await fetchGameList();
    },
    get: async (event, context) => {
        console.log("get -> start with event: ", event, " and context: ", context);
        console.log("event", event);
        if (event.queryStringParameters.gameId === undefined) {
            return {
                statusCode: 404,
                massage: "Invalid Input"
            }
        }
        let gameId = event.queryStringParameters.gameId;
        let getParams = {
            TableName: process.env.DYNAMODB_GAME_TABLE,
            Key: {
                'gameId': gameId
            },

        };
        console.log('getParams', getParams);
        let getResult = {};
        try {
            let dynamodb = new AWS.DynamoDB.DocumentClient();
            getResult = await dynamodb.get(getParams).promise()
        } catch (getError) {
            console.log('There aws a problem getting the kitten')
            console.log('getParams', getParams)
            console.log('getError', getError)
            return {
                statusCode: 500
            }
        }
        console.log('getResult', getResult)
        if (getResult.Item === null) {
            return {
                statusCode: 404
            }
        }
        return {
            statusCode: 200,
            body: JSON.stringify({
                gameId: getResult.Item.gameId !== undefined ? getResult.Item.gameId : "",
                attackerGroup: getResult.Item.attackerGroup !== undefined ? getResult.Item.attackerGroup : "",
                defenderGroup: getResult.Item.defenderGroup !== undefined ? getResult.Item.defenderGroup : "",
                place: getResult.Item.place !== undefined ? getResult.Item.place : "",
                winners: getResult.Item.winners !== undefined ? getResult.Item.winners : "",
                players: getResult.Item.players !== undefined ? getResult.Item.players : "",
                isActive: getResult.Item.isActive !== undefined ? getResult.Item.isActive : "",
                Judge: {
                    playerId: getResult.Item.playerId !== undefined ? getResult.Item.playerId : "",
                    tokenId: getResult.Item.tokenId !== undefined ? getResult.Item.tokenId : "",
                    name: getResult.Item.name !== undefined ? getResult.Item.name : ""
                }
            })
        }
    },
    update: async (event, context) => {
        console.log("update -> start with event:{} and context: {}", event, context);
        console.log("event.queryStringParameters", event.queryStringParameters)
        console.log("event.body", event.body)
        let updateParams = {}
        if (event.queryStringParameters.gameId === undefined) {
            return {
                statusCode: 400,
                massage: "Invalid Input"
            }
        }
        let bodyObj = parsEventToJson(event);
        console.log("bodyObj: ", bodyObj);
        if (event.queryStringParameters.winners !== undefined) {
            if (event.queryStringParameters.winners === ATTACKERS || event.queryStringParameters.winners === DEFENDERS) {
                let winners = bodyObj.winners;
                updateParams = winnersParams(winners, event);

            } else {
                console.log("missing params");
                return {
                    statusCode: 400
                }
            }

        } else if (bodyObj.playerId !== undefined) {
            let playerId = bodyObj.playerId;
            let player = await fetchPlayer(playerId, event);
            console.log("add user case response: ", player);
            updateParams = addPlayer(player, event);

        } else if (bodyObj.attackerGroup !== undefined || bodyObj.defenderGroup !== undefined || bodyObj.place !== undefined || bodyObj.judge !== undefined) {
            let game = bodyObj
            updateParams = setGameParams(game, event)
        } else {
            console.log("missing params");
            return {
                statusCode: 400
            }
        }
        let response = {};
        console.log("update -> updateParams : ", updateParams);
        try {
            let dynamodb = new AWS.DynamoDB.DocumentClient();
            response = await dynamodb.update(updateParams).promise()
        } catch (updateError) {
            console.log('There aws a problem update the game');
            console.log('updateParams', updateParams);
            console.log('updateError', updateError);
            return {
                statusCode: 500
            }
        }

        console.log("response", response);
        return {
            statusCode: 200
        }


    },
    delete: async (event, context) => {

        let deleteParams = {
            TableName: process.env.DYNAMODB_GAME_TABLE,
            Key: {
                gameId: event.queryStringParameters.gameId
            }
        }
        let deleteResult = {}
        try {
            let dynamodb = new AWS.DynamoDB.DocumentClient();
            deleteResult = await dynamodb.delete(deleteParams).promise()
        } catch (deleteError) {
            console.log('There aws a problem getting the kitten')
            console.log('deleteParams', deleteParams)
            console.log('deleteError', deleteError)
            return {
                statusCode: 500
            }
        }
        console.log('deleteResult', deleteResult)
        return {
            statusCode: 200
        }
    },


};

const fetchPlayer = async (playerId) => {
    console.log("Start fetch player func")
    let response = {}
    let getParams = {
        TableName: process.env.DYNAMODB_PLAYERS_TABLE,
        Key: {
            'playerId': playerId
        },
    };
    try {
        let dynamodb = new AWS.DynamoDB.DocumentClient();
        response = await dynamodb.get(getParams).promise()
    } catch (getError) {
        console.log('There aws a problem to get the player in update method');
        console.log('getParams', getParams);
        console.log('getError', getError);
        return {
            statusCode: 500
        }
    }
    console.log("fetchPlayer-> response: ", response);
    return response;
};

const winnersParams = (winners, event) => {
    console.log("Start winners params func")
    let updateParams = {
        TableName: process.env.DYNAMODB_GAME_TABLE,
        Key: {
            gameId: event.queryStringParameters.gameId
        },
        UpdateExpression: "SET winners = :winners, isActive = :isActive",
        ExpressionAttributeValues: {
            ':winners': winners,
            ':isActive': false
        },
        ReturnValues: 'UPDATED_NEW'
    };
    return updateParams;
}

const addPlayer = (player, event) => {
    console.log("Start add params func with player: ", player, "and event: ", event);
    let updateParams = {
        TableName: process.env.DYNAMODB_GAME_TABLE,
        Key: {
            gameId: event.queryStringParameters.gameId
        },
        UpdateExpression: "SET players = list_append(players,:player)",
        ExpressionAttributeValues: {':player': [player]},
        ReturnValues: 'UPDATED_NEW'
    };
    console.log("addPlayer-> updateParams")
    return updateParams
};

const parsEventToJson = (event) => {
    console.log("Start pars event to json func");
    let bodyObj = {};
    try {
        bodyObj = JSON.parse(event.body)
    } catch (jsonError) {
        console.log('There was an error parsing the body', jsonError)
        return {
            statusCode: 400
        }
    }
    return bodyObj;
};

const setGameParams = (game, event) => {
    console.log("Start set game params with: ", game, "and event: ", event);
    let updateParams = {
        TableName: process.env.DYNAMODB_GAME_TABLE,
        Key: {
            gameId: event.queryStringParameters.gameId
        },
        UpdateExpression: "SET attackerGroup = :attackerGroup, defenderGroup = :defenderGroup, place = :place, judge= :judge ",
        ExpressionAttributeValues: {
            ":attackerGroup": game.attackerGroup,
            ":defenderGroup": game.defenderGroup,
            ":place": game.place,
            ":judge": {
                "playerId": game.judge.playerId,
                "name": game.judge.name
            }
        },
        ReturnValues: 'UPDATED_NEW'
    };
    console.log("setGameParams-> updateParams: ", updateParams);
    return updateParams;
};

const fetchGameList = async () => {
    let scanParams = {
        TableName: process.env.DYNAMODB_GAME_TABLE
    };
    console.log('scanParams', scanParams);
    let scanResult = {};
    try {
        let dynamodb = new AWS.DynamoDB.DocumentClient();
        scanResult = await dynamodb.scan(scanParams).promise()
    } catch (scanError) {
        console.log('There aws a problem scanning the kitten')
        console.log('scanParams', scanParams)
        console.log('scanError', scanError)
        return {
            statusCode: 500
        }
    }
    console.log("scanResult", scanResult);
    if (scanResult.Items !== null) {
        if (!Array.isArray(scanResult.Items) ||
            scanResult.Items.length === 0) {
            return {
                statusCode: 404
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify(scanResult.Items.map(game => {
                return {
                    gameId: game.gameId !== undefined ? game.gameId : "",
                    attackerGroup: game.attackerGroup !== undefined ? game.attackerGroup : "",
                    defenderGroup: game.defenderGroup !== undefined ? game.defenderGroup : "",
                    place: game.place !== undefined ? game.place : "",
                    winners: game.winners !== undefined ? game.winners : "",
                    players: game.players !== undefined ? game.players : "",
                    isActive: game.isActive !== undefined ? game.isActive : "",
                    Judge: {
                        playerId: game.judge !== undefined && game.judge.playerId !== undefined ? game.judge.playerId : "",
                        tokenId: game.judge !== undefined && game.judge.tokenId !== undefined ? game.judge.tokenId : "",
                        name: game.judge !== undefined && game.judge.name !== undefined ? game.judge.name : ""
                    }
                }
            }))
        }

    } else if (scanResult.Item !== null) {
        if (!Array.isArray(scanResult.Item) ||
            scanResult.Item.length === 0) {
            return {
                statusCode: 404
            }

        }
        console.log("scanResult: ", scanResult)
        return {
            statusCode: 200,
            body: JSON.stringify(scanResult.Item.map(game => {
                return {
                    gameId: game.gameId !== undefined ? game.gameId : "",
                    attackerGroup: game.attackerGroup !== undefined ? game.attackerGroup : "",
                    defenderGroup: game.defenderGroup !== undefined ? game.defenderGroup : "",
                    place: game.place !== undefined ? game.place : "",
                    winners: game.winners !== undefined ? game.winners : "",
                    players: game.players !== undefined ? game.players : "",
                    isActive: game.isActive !== undefined ? game.isActive : "",
                    Judge: {
                        playerId: game.judge !== undefined && game.judge.playerId !== undefined ? game.judge.playerId : "",
                        tokenId: game.judge !== undefined && game.judge.tokenId !== undefined ? game.judge.tokenId : "",
                        name: game.judge !== undefined && game.judge.name !== undefined ? game.judge.name : ""
                    }
                }
            }))
        }
    }

    return {
        statusCode: 404
    }

};

const findActiveGame = (gameList) => {
    if(!!gameList){
        if (gameList.length >= 1) {
            let game = gameList.filter(game => {
                return game.isActive === true
            }).map(res => {
                return {gameList: res};
            });
            console.log("findActiveGame -> game: ", typeof game);
            if (game !== undefined && game.length > 0) {
                return game;
            }
            return false;
        } else if (gameList.isActive === true) {
            return gameList;
        }
    }
    return false
};

const createGame = async (bodyObj) => {
    let gameId = uuid();
    let putParams = {
        TableName: process.env.DYNAMODB_GAME_TABLE,
        Item: {
            gameId: gameId,
            attackerGroup: bodyObj.attackerGroup,
            defenderGroup: bodyObj.defenderGroup,
            players: bodyObj.players,
            place: bodyObj.place,
            winners: "Game is on",
            startGameTime: Date.now(),
            isActive: true,
            judge: {
                playerId: bodyObj.judge.playerId,
                tokenId: bodyObj.judge.tokenId,
                name: bodyObj.judge.name
            }
        }
    }
    console.log('putParams:', putParams)
    let putResult = {}
    try {
        let dynamodb = new AWS.DynamoDB.DocumentClient()
        putResult = await dynamodb.put(putParams).promise()
    } catch (putError) {
        console.log('There aws a problem putting the kitten')
        console.log('putParams: ', putParams)
        console.log('putError: ', putError)
        return {
            statusCode: 500
        }
    }
    console.log("putResult: ", putResult);
    return {
        statusCode: 200,
        body: JSON.stringify({
                gameId: gameId
            }
        )
    }
};