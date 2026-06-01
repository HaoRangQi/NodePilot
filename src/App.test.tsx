import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("nodepilot.locale", "en-US");
  });

  it("renders the NodePilot management shell", () => {
    render(<App />);

    expect(screen.getByLabelText("NodePilot")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Node v22.11.0" })).toBeInTheDocument();
    expect(screen.getAllByText("nvm-sh").length).toBeGreaterThan(0);
  });

  it("uses the persisted locale and theme", () => {
    localStorage.setItem("nodepilot.locale", "en-US");
    localStorage.setItem("nodepilot.theme", "dark");

    const { container } = render(<App />);

    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(container.querySelector(".app-shell")).toHaveAttribute("data-theme", "dark");
  });
});
