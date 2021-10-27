import { RedisSubject } from "../../dist";

const subject = new RedisSubject();

function timeoutAsync(time: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, time);
    });
}

async function main(): Promise<void> {
    let msgId = 1;
    while (true) {
        await timeoutAsync(1000);
        await subject.publish('my-channel', {timeStamp: Date.now(), msg: `msg ${msgId}`});
        msgId++;
    }
}

main()
.catch(err => console.error(err));