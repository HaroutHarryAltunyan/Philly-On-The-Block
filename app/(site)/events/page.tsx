import { Reveal, RevealWords } from "../../components/cinematic/reveal";
import EventForm from "./event-form";

const EVENT_KINDS = ["Private parties", "Office lunches", "Birthdays", "Film productions", "Studio sets", "Corporate events"];

export default function EventsPage() {
  return (
    <>
      <section className="page-hero page-hero-green events-hero">
        <img className="events-hero-truck" src="/images/otb-food-truck.png" alt="" aria-hidden="true" width={1390} height={1017} />
        <p className="eyebrow">Events &amp; catering</p>
        <RevealWords as="h1" className="display-xl" text="Bring the block to your event." />
        <Reveal delay={250}>
          <p className="lede">Cheesesteaks for the whole crew. Tell us about your event and we’ll reach out to confirm availability, menu, and details.</p>
        </Reveal>
        <ul className="event-kinds">
          {EVENT_KINDS.map((kind) => (
            <li key={kind}>{kind}</li>
          ))}
        </ul>
      </section>
      <section className="page-body page-body-cream">
        <div className="grid-2 events-grid">
          <div>
            <h2 className="display-lg">Request a date.</h2>
            <p className="lede">
              No payment now — this is a request. Pricing depends on headcount and menu, so we’ll quote it when we
              call you back. Need it sooner? Call <a className="inline-link" href="tel:+18184066053">(818) 406-6053</a>.
            </p>
          </div>
          <EventForm />
        </div>
      </section>
    </>
  );
}
