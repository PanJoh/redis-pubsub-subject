import redis, { RedisClient } from 'redis';
import { PubSubEngine } from 'graphql-subscriptions';
import { promisify } from 'util';

export interface MessageWithTimeStamp {
    timeStamp: number;
    msg: any;
}

interface Channel {
    subscriptions: number;
    currentMessage?: MessageWithTimeStamp;
    handlers: ((msg: MessageWithTimeStamp) => void)[];
}

interface Subscription {
    channel: string;
    onMessage: (msg: MessageWithTimeStamp) => void;
}

export class RedisSubject extends PubSubEngine {
    nextSubId: number = 0;

    subscriptions: {[subId: number]: Subscription} = {};

    channels: {[channel: string]: Channel} = {}

    subClient: RedisClient;
    redisClient: RedisClient;

    constructor() {
        super();
        this.subClient = redis.createClient();
        this.redisClient = this.subClient.duplicate();
        this.handleMessages();
        this.handleRedisErrors();
    }

    async publish(triggerName: string, payload: MessageWithTimeStamp): Promise<void> {
        const jsonValue = JSON.stringify(payload);
        await promisify(this.redisClient.set).bind(this.redisClient)(triggerName, jsonValue);

        await promisify(this.redisClient.publish).bind(this.redisClient)(triggerName, jsonValue);
    }
    
    subscribe(triggerName: string, onMessage: (msg: MessageWithTimeStamp) => void, options: Object): Promise<number> {
        let ch = this.channels[triggerName];
        if (ch == null) {
            ch = this.createChannel(triggerName);
        }
        
        const subId = this.nextSubId;
        this.nextSubId++;

        ch.handlers.push(onMessage);
        ch.subscriptions++;
        this.subscriptions[subId] = {channel: triggerName, onMessage };
        if (ch.currentMessage != null) {
            onMessage(ch.currentMessage);
        }

        return Promise.resolve(subId);
    }
    
    unsubscribe(subId: number) {
        const subscription = this.subscriptions[subId];
        if (subscription == null) {
            return;
        }

        delete this.subscriptions[subId]

        const ch = this.channels[subscription.channel];
        if (ch == null) {
            return;
        }

        const idx = ch.handlers.indexOf(subscription.onMessage);
        if (idx < 0) {
            return;
        }

        ch.handlers.splice(idx, 1);
        ch.subscriptions--;
        if (ch.subscriptions == 0) {
            delete this.channels[subscription.channel]
            this.subClient.unsubscribe(subscription.channel);
        }
    }


    private createChannel(channel: string): Channel {
        const ch = this.channels[channel] = {
            subscriptions: 0,
            handlers: [],
        };

        this.redisClient.get(channel, (err, jsonValue) => {
            if (err) {
                console.error(err);
            }

            if (jsonValue == null) {
                return;
            }

            this.handleJsonValue(channel, jsonValue);
        });

        this.subClient.subscribe(channel);

        return ch;
    }

    private handleJsonValue(chId: string, jsonValue: string) {
        const channel = this.channels[chId];
        if (channel == null) {
            return;
        }

        const msgWithTimeStamp: MessageWithTimeStamp = JSON.parse(jsonValue);
        if (channel.currentMessage == null || msgWithTimeStamp.timeStamp > channel.currentMessage.timeStamp) {
            channel.currentMessage = msgWithTimeStamp;

            for (const handler of channel.handlers) {
                handler(msgWithTimeStamp);
            }
        }
    }

    private handleMessages() {
        this.subClient.on('message', (chId, message) => {
            if (message == null) {
                return;
            }

            this.handleJsonValue(chId, message);            
        })
    }

    private handleRedisErrors() {
        this.subClient.on('error', (err) => console.error(err));
        this.redisClient.on('error', (err) => console.error(err));
    }
}