import * as df from 'durable-functions';
import { app, HttpHandler, HttpRequest, HttpResponse, InvocationContext } from '@azure/functions';


const DurableOrchestratorTestHttpStart: HttpHandler = async (request: HttpRequest, context: InvocationContext): Promise<HttpResponse> => {
    const client = df.getClient(context);
    const body: unknown = await request.text();
    const instanceId: string = await client.startNew(request.params.orchestratorName, { input: body });

    context.log(`Started orchestration with ID = '${instanceId}'.`);

    return client.createCheckStatusResponse(request, instanceId);
};

app.http('DurableOrchestratorTestHttpStart', {
    route: 'orchestrators1/{orchestratorName}',
    extraInputs: [df.input.durableClient()],
    handler: DurableOrchestratorTestHttpStart,
});