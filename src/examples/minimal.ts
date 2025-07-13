import { HasEventType, PostgresEventStore, createFilter } from '../eventstore';

import dotenv from 'dotenv';
dotenv.config();

const RUN_ID = new Date().toISOString().replace(/[-:T.Z]/g, '');
console.log("Run ID: " + RUN_ID + "\n")


// Event names are suffixed with RUN_ID so there are no collisions between
// different runs of this example. Usually the event names are fixed.
const STUDENT_REGISTERED_EVENTNAME = "StudenRegistered_" + RUN_ID;
const COURSED_OPENED_EVENTNAME = "CourseOpened_" + RUN_ID;
const STUDENT_ENROLLED_IN_COURSE_EVENTNAME = "StudentEnrolledInCourse_" + RUN_ID;

class VeryGenericEvent implements HasEventType {
    constructor(
      public readonly id: string,
      public readonly data: Record<string, unknown>,
      public readonly eventTypeName: string,
      public readonly timestamp: Date = new Date()
    ) {}
  
    eventType(): string {
      return this.eventTypeName;
    }
  
    eventVersion(): string {
      return '1.0';
    }
  }


async function main() {
    const eventstore = new PostgresEventStore({ 
        connectionString: process.env.DATABASE_TEST_URL || 'postgres://postgres:postgres@localhost:5432/eventstore'
    });
    eventstore.initializeDatabase();
    try{
        /*
        We want to append an event without checking for consistency.
        Most real feature implementation won't be so simple - there is always some constraint to check
        before a new event is appended - but for this example we skip that.
        */

        // The event to append
        const event1JohnRegistered = new VeryGenericEvent('1', { name: 'John' }, STUDENT_REGISTERED_EVENTNAME);

        // A filter which never returns any events
        const filterForEmptyContext = createFilter(["NON-EXISTENT-EVENT"]);
        // Append the event: it's a conditional append, but the condition trivially is alwasy met.
        // Since there never was a query preceding the append and there are no events matching the
        // filter, the max. sequence number is 0.
        await eventstore.append<VeryGenericEvent>(filterForEmptyContext, [event1JohnRegistered], 0);

        // Now let's check if the event was written.
        // A filter with just the event type will do
        const filter1 = createFilter([STUDENT_REGISTERED_EVENTNAME]);
        const context1 = await eventstore.query<VeryGenericEvent>(filter1);
        console.log(`Context max. seq. num: ${context1.maxSequenceNumber}`)
        console.log(`Number of events retrieved: ${context1.events.length}`)
        console.log(`Name of first and only student retrieved: ${((context1.events[0] as VeryGenericEvent).data as any).name}`)

        /*
        Let's create a course and enroll student John in that course.
        We do that without any checks.
        */
        const event2CourseOpened = new VeryGenericEvent('99', { title: 'Event Sourcing 101' }, COURSED_OPENED_EVENTNAME);
        await eventstore.append<VeryGenericEvent>(filterForEmptyContext, [event2CourseOpened], 0);

        const event3RegisterJohnWithCourse = new VeryGenericEvent('99', { studentId: '1' }, STUDENT_ENROLLED_IN_COURSE_EVENTNAME);
        await eventstore.append<VeryGenericEvent>(filterForEmptyContext, [event3RegisterJohnWithCourse], 0)

        /*
        Now for the real fun: we want a conditional appened.
        For that we'll try to enroll the John again - which should fail.
        This will show how a feature command is properly implemented:
        1. Query the event store for the context of the command
        2. Check the context.
        3. Only generate new events if the check found no violations of any rules.
        */
        // Parameters of command "enroll student in course"
        const idOfStudentToEnroll = '1';
        const idOfCourseToEnrollIn = '99';

        // Query event store for context
        const contextFilter = createFilter([
            STUDENT_REGISTERED_EVENTNAME, COURSED_OPENED_EVENTNAME, STUDENT_ENROLLED_IN_COURSE_EVENTNAME
        ], [{ id: idOfStudentToEnroll }, { id: idOfCourseToEnrollIn}, { data: { studentId: idOfStudentToEnroll}}]);
        const context = await eventstore.query<VeryGenericEvent>(contextFilter);
        console.log(`Context max. seq. num: ${context.maxSequenceNumber}`)
        console.log(`Number of events retrieved: ${context.events.length}`)
        for (const event of context.events) {
            console.log(`Event: ${JSON.stringify(event)}`)
        }

        // Build context model from events
        const contextModel = {studentRegistered: false, courseOpened: false, studentAlreadyEnrolledInCourse: false}
        for (const event of context.events) {
            if (event.eventType() === STUDENT_REGISTERED_EVENTNAME && event.id === idOfStudentToEnroll) {
                contextModel.studentRegistered = true;
            }
            if (event.eventType() === COURSED_OPENED_EVENTNAME && event.id === idOfCourseToEnrollIn) {
                contextModel.courseOpened = true;
            }
            if (event.eventType() === STUDENT_ENROLLED_IN_COURSE_EVENTNAME && event.id === idOfCourseToEnrollIn && event.data.studentId === idOfStudentToEnroll) {
                contextModel.studentAlreadyEnrolledInCourse = true;
            }
        }

        // Apply rules to context model
        const allRulesPassed = !contextModel.studentAlreadyEnrolledInCourse && contextModel.studentRegistered && contextModel.courseOpened;

        // Print result
        console.log(`All rules passed? ${allRulesPassed}`)
    } finally {
        eventstore.close();
    }
}


main();