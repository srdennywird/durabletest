// imports comunes
import { app, InvocationContext } from "@azure/functions";
import * as https from "https";
import * as df from 'durable-functions';
import { ActivityHandler, OrchestrationContext, OrchestrationHandler } from 'durable-functions';


/**
 * comienzo de codigo "custom"
 */
const livechatEndpoint = "https://api.livechatinc.com/v3.5/agent/action/get_chat";
const username = "63a7e53d-5124-471b-9faf-ccbd08789dc1";
const password = "dal:_ctRfDJ-NVAIyQfWhyZS20Hy9C4";

const systemMessage = "system_message";

const nlpEndpoint = "https://api.wholemeaning.com/api/v1/model/tester";
const token = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiI4NEJiRXdrVG02Mm9PQ1Brd24wQ0gxSmJMeDJ2aEFpMSIsIm1vZGVsIjoxMzE0LCJsYW5ndWFnZSI6ImVzIiwiY3VzdG9tZXIiOjYzfQ.NEDfusL945y1rWf7wqOSG1m-HAAAeGqanmSXSzHRpoA"; // Replace with your actual access token

const airtableEndpoint = "https://api.airtable.com/v0";
const airtablePAT = "patBzO6wvlrP63vlE.7f9ddc96d1af69e4d34cb421608d186be47f30d6519fa286cf4f490e65bfaae0"; // Replace with your actual Airtable Personal Access Token

const addUserToChatEndpoint = "https://api.livechatinc.com/v3.5/agent/action/add_user_to_chat"
const assignEventToChatEndpoint = "https://api.livechatinc.com/v3.5/agent/action/send_event";


const getLiveChatThread: ActivityHandler = async function (
    data: any, 
    context: InvocationContext,
): Promise<any> {
    context.log("TypeScript Activity. getLiveChatThread");

    // Delay for 20 seconds (20000 milliseconds)
    await new Promise(resolve => setTimeout(resolve, 20000));
    const { id, thread } = data.payload.chat;
    const authHeaderValue = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

    const requestOptions: https.RequestOptions = {
        method: "POST",
        headers: {
            Authorization: authHeaderValue,
            "Content-Type": "application/json"
        }
    };

    const postData = JSON.stringify({
        chat_id: id,
        thread_id: thread.id
    });

    const response = await sendHttpRequest(livechatEndpoint, postData, requestOptions);
    const chatData = JSON.parse(response);
    
    // Handle the chatData and return a response if necessary
    return chatData;
};

df.app.activity("getLiveChatThread", {
    handler: getLiveChatThread
});

/****************************************************************************************************************************/

async function sendHttpRequest(url: string, data: string, options: https.RequestOptions): Promise<string> {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let responseBody = "";
            res.on("data", (chunk) => {
                responseBody += chunk;
            });
            res.on("end", () => {
                resolve(responseBody);
            });
        });

        req.on("error", (error) => {
            reject(error);
        });

        req.write(data);
        req.end();
    });
}

/****************************************************************************************************************************/

const mergeLiveChatThread: ActivityHandler = async function (
    input: any, 
    context: InvocationContext,
): Promise<any> {
    context.log("TypeScript Activity. mergeLiveChatThread");

    const text = getMessagesText(input.thread.events);
    const language = "es"; // Set the desired language

    return { text, language, chatId: input.thread.chat_id }
};

df.app.activity("mergeLiveChatThread", {
    handler: mergeLiveChatThread
});

/****************************************************************************************************************************/

function getMessagesText(events: any): string {
    const messagesText: string[] = [];

    for (const event of events) {
        if (event.type === systemMessage) {
            continue;
        }

        messagesText.push(event.text);
    }

    return messagesText.join(" ");
}

/****************************************************************************************************************************/

const NlpService: ActivityHandler = async function (
    input: string, 
    context: InvocationContext,
): Promise<any> {
    context.log("TypeScript Activity. NlpService");
    const requestOptions: https.RequestOptions = {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        }
    };

    const postData = JSON.stringify({
        text: input
    });

    const response = await sendHttpRequest(nlpEndpoint, postData, requestOptions);
    return JSON.parse(response);
};

df.app.activity("NlpService", {
    handler: NlpService
});

/****************************************************************************************************************************/

const getAirTableResultByClassification: ActivityHandler = async function (
    input: any,
    context: InvocationContext
): Promise<any> {
    context.log("TypeScript Activity. getAirTableResultByClassification");

    const categories = input.classifications.flatMap(classif => classif.classes.map(classInfo => classInfo.name.toLowerCase()));

    const requestOptions: https.RequestOptions = {
        method: "GET",
        headers: {
            Authorization: `Bearer ${airtablePAT}`,
            "Content-Type": "application/json"
        }
    };

    const response = await sendHttpRequest(airtableEndpoint  + "/appDi1ZLQLuoKK6FU/Automations", "", requestOptions);
    const records = JSON.parse(response).records;
    let message: any = null;

    records.forEach(record => {
        const classification = record.fields.classification?.toLowerCase();
        if (classification && categories.includes(classification)) {
            const action = record.fields.action || "none";
            const content = record.fields.content || "none";
            message = { action, content };
        }
    });

    if (!message) {
        message = { action: "none", content: "none" };
    }

    return message;
};

df.app.activity("getAirTableResultByClassification", {
    handler: getAirTableResultByClassification
});

/****************************************************************************************************************************/

const respondMessage: ActivityHandler = async function (
    input: any, 
    context: InvocationContext
): Promise<string> {
    context.log("TypeScript Activity. respondMessage");

    // Parse query parameter
    const addUserToChatRequest = {
        "chat_id": input.chatId,
        "user_id": "jmtobar@wholemeaning.com",
        "user_type": "agent",
        visibility: "all",
        "ignore_requester_presence": true
    };

    await addUserToChat(addUserToChatRequest);
    const messageRequest = {
        event: {
            type: "message",
            text: input.text,
            visibility: "all"
        },
        "chat_id": input.chatId
    };
    const result = await addEventToChat(messageRequest);

    return result;
};

df.app.activity("respondMessage", {
    handler: respondMessage
});

async function addUserToChat(request: any): Promise<string> {
    
    const requestOptions: https.RequestOptions = {
        method: "POST",
        headers: {
            Authorization: "Basic " + Buffer.from(username + ":" + password).toString("base64"),
            "Content-Type": "application/json"
        }
    }
    const postData = JSON.stringify(request)

    const response = await sendHttpRequest(addUserToChatEndpoint, postData, requestOptions);

    return response;
}

async function addEventToChat(request: any): Promise<string> {
    
    const requestOptions: https.RequestOptions = {
        method: "POST",
        headers: {
            Authorization: "Basic " + Buffer.from(username + ":" + password).toString("base64"),
            "Content-Type": "application/json"
        }
    }
    const postData = JSON.stringify(request)

    const response = await sendHttpRequest(assignEventToChatEndpoint, postData, requestOptions);

    return response;
}


/***************************************************************************************************************************/
const durableOrchestrator: OrchestrationHandler = function* (context: OrchestrationContext) {
    const outputs = [];
    const liveChatThread = yield context.df.callActivity('getLiveChatThread', context.df.getInput());
    const messageText = yield context.df.callActivity('mergeLiveChatThread', liveChatThread);
    const nlpResponse = yield context.df.callActivity('NlpService', messageText.text);
    const airtableResponse = yield context.df.callActivity('getAirTableResultByClassification', nlpResponse);
    const brokerMessage = {
        chatId: liveChatThread.id,
        text: airtableResponse.content
    };

    if(airtableResponse.action !== "none") {
        const response = yield context.df.callActivity('respondMessage', brokerMessage);
    }

    return outputs;
}

df.app.orchestration('OrchestrationHandler', durableOrchestrator);

/****************************************************************************************************************************/

/**
 * Codigo comun 
 */
export async function serviceBusQueueTrigger(message: unknown, context: InvocationContext): Promise<void> {
    context.log('Service bus queue function processed message:', message); 
    const client = df.getClient(context);
    const instanceId: string = await client.startNew("OrchestrationHandler", { input: message }); 
    context.log(`Started orchestration with ID = '${instanceId}'.`);
}

app.serviceBusQueue('serviceBusQueueTrigger', {
    connection: 'AzureQueues',
    queueName: 'livechat-queue',
    handler: serviceBusQueueTrigger, 
    extraInputs: [df.input.durableClient()],
});
