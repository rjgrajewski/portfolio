import { Container } from "../ui/Container";

export function Footer() {
  return (
    <footer className="border-t border-neutral-900 py-8">
      <Container>
        <p className="text-small text-neutral-600">
          © 2026 Rafal Grajewski. Built on Amazon Bedrock — see the
          &ldquo;This Portfolio&rdquo; section for how.
        </p>
      </Container>
    </footer>
  );
}
