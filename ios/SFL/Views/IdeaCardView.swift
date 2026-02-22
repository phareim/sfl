import SwiftUI

struct IdeaCardView: View {
    let idea: Idea

    private var type: IdeaType { idea.type.ideaType }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header row: icon + type label + date
            HStack {
                Text(type.icon)
                    .font(.system(size: 13))
                Text(type.label)
                    .font(.sflLabel)
                    .tracking(0.8)
                    .foregroundStyle(type.color)
                Spacer()
                Text(idea.formattedDate)
                    .font(.sflMeta)
                    .foregroundStyle(Color.sflMuted)
            }

            // Title
            Text(idea.displayTitle)
                .font(.sflCardTitle)
                .foregroundStyle(Color.sflText)
                .lineLimit(2)
                .multilineTextAlignment(.leading)

            // Summary or URL
            if let summary = idea.summary, !summary.isEmpty {
                Text(summary)
                    .font(.sflSmall)
                    .foregroundStyle(Color.sflMuted)
                    .lineLimit(2)
            } else if let url = idea.url {
                Text(host(url))
                    .font(.sflSmall)
                    .foregroundStyle(Color.sflMuted)
                    .lineLimit(1)
            }
        }
        .padding(14)
        .sflCard(typeColor: type.color)
    }

    private func host(_ raw: String) -> String {
        URL(string: raw)?.host ?? raw
    }
}
