import { RedisSubject, MessageWithTimeStamp } from '../../dist';


const subject = new RedisSubject();

class SubjectItarable implements AsyncIterable<MessageWithTimeStamp> {
    constructor(private chId: string) {
    }

    [Symbol.asyncIterator](): AsyncIterator<MessageWithTimeStamp, void, undefined> {
        return subject.asyncIterator(this.chId);
    }

}

async function main() {
    for await (const msg of new SubjectItarable('my-channel')) {
        console.log(`${msg.timeStamp} ${msg.msg}`);
    }
}

main()
.catch(err => console.error(err));